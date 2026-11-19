import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { extname, isAbsolute, join, normalize, relative } from 'node:path';
import { admin, config, createAuthClient } from './config.mjs';
import { createAuthorizer } from './auth.mjs';
import { HttpError, getCookies, parseJsonBody as parseBody, sendJson as send } from './http.mjs';
import { httpUrl, requiredText as assertText } from './validation.mjs';

const root = config.publicDirectory;
const requireUser = createAuthorizer({ admin, createAuthClient });
const loginAttempts = new Map();
const evidenceBucket = 'submission-evidence';
const imageTypes = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

function matchesImageSignature(buffer, mimeType) {
  if (mimeType === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  if (mimeType === 'image/webp') return buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP';
  return false;
}

function sessionCookies(session) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return [
    `rizlife_access=${encodeURIComponent(session.access_token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${session.expires_in}${secure}`,
    `rizlife_refresh=${encodeURIComponent(session.refresh_token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure}`,
  ];
}

function clearSessionCookies() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return [
    `rizlife_access=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`,
    `rizlife_refresh=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`,
  ];
}

function setSecurityHeaders(response) {
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('x-frame-options', 'DENY');
  response.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  response.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
}

function limitAuthentication(request) {
  const key = request.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const limit = 10;
  const attempts = (loginAttempts.get(key) || []).filter((time) => now - time < windowMs);
  attempts.push(now);
  loginAttempts.set(key, attempts);
  if (attempts.length > limit) throw new HttpError(429, 'Too many sign-in attempts. Please try again later.');
}

async function addEvidenceUrls(rows) {
  const imageRows = rows.filter((row) => row.evidence_type === 'image' && row.evidence && !/^https?:\/\//i.test(row.evidence));
  if (!imageRows.length) return rows;
  const paths = [...new Set(imageRows.map((row) => row.evidence))];
  const { data, error } = await admin.storage.from(evidenceBucket).createSignedUrls(paths, 3600);
  if (error) throw error;
  const urls = new Map(paths.map((path, index) => [path, data[index]?.signedUrl || null]));
  return rows.map((row) => ({
    ...row,
    evidence_url: row.evidence_type === 'image' ? (/^https?:\/\//i.test(row.evidence) ? row.evidence : urls.get(row.evidence) || null) : null,
  }));
}

async function latestSubmissions(studentId=null) {
  let query = admin.from('submissions').select('*').order('id', { ascending:false });
  if (studentId) query = query.eq('student_id', studentId);
  const { data, error } = await query;
  if (error) throw error;
  const seen = new Set();
  const latest = data.filter(row => {
    const key = `${row.student_id}:${row.quest_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return addEvidenceUrls(latest);
}

async function studentCard(studentId) {
  const { data:enrollments, error:enrollmentError } = await admin.from('section_students').select('section_id').eq('student_id',studentId);
  if (enrollmentError) throw enrollmentError;
  const sectionIds = enrollments.map(row=>row.section_id);
  if (!sectionIds.length) return [];
  const [{ data:quests, error:questError }, submissions] = await Promise.all([
    admin.from('quests').select('id,title,description,requirement,section_id').in('section_id',sectionIds).eq('active', true).order('id'),
    latestSubmissions(studentId)
  ]);
  if (questError) throw questError;
  const byQuest = new Map(submissions.map(row => [Number(row.quest_id), row]));
  return quests.map(quest => ({ ...quest, submission:byQuest.get(Number(quest.id)) || null }));
}

async function requireOwnedSection(teacherId, sectionId) {
  const id = Number(sectionId);
  if (!id) throw new HttpError(400, 'Select a class first.');
  const { data, error } = await admin.from('sections').select('id,name').eq('id',id).eq('teacher_id',teacherId).eq('active',true).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, 'Class not found.');
  return data;
}

async function dashboardData(teacherId, sectionId) {
  const section = await requireOwnedSection(teacherId, sectionId);
  const { data:enrollments, error:enrollmentError } = await admin.from('section_students').select('student_id').eq('section_id',section.id);
  if (enrollmentError) throw enrollmentError;
  const studentIds = enrollments.map(row=>row.student_id);
  const profileQuery = studentIds.length ? admin.from('profiles').select('id,name,active').in('id',studentIds).eq('active',true).order('name') : Promise.resolve({data:[],error:null});
  const [{ data:profiles, error:profileError }, { data:quests, error:questError }, { data:allSubmissions, error:submissionError }] = await Promise.all([
    profileQuery,
    admin.from('quests').select('id,title').eq('section_id',section.id).eq('active',true).order('id'),
    admin.from('submissions').select('*').order('id',{ascending:false})
  ]);
  if (profileError || questError || submissionError) throw profileError || questError || submissionError;

  const questIds = new Set(quests.map(q=>Number(q.id)));
  const sectionSubmissions = await addEvidenceUrls(allSubmissions.filter(row=>questIds.has(Number(row.quest_id)) && studentIds.includes(row.student_id)));
  const latest = [];
  const seen = new Set();
  for (const row of sectionSubmissions) {
    const key = `${row.student_id}:${row.quest_id}`;
    if (!seen.has(key)) { seen.add(key); latest.push(row); }
  }
  const profileMap = new Map(profiles.map(profile => [profile.id, profile]));
  const questMap = new Map(quests.map(quest => [Number(quest.id), quest]));
  const students = profiles.map(profile => {
    const rows = latest.filter(row => row.student_id === profile.id);
    return {
      id:profile.id,
      name:profile.name,
      email:'',
      verified:rows.filter(row=>row.status==='verified').length,
      submitted:rows.filter(row=>row.status==='submitted').length,
      rejected:rows.filter(row=>row.status==='rejected').length
    };
  });
  const decorate = row => ({
    ...row,
    student_name:profileMap.get(row.student_id)?.name || 'Unknown student',
    title:questMap.get(Number(row.quest_id))?.title || 'Archived task'
  });
  return {
    students,
    queue:latest.filter(row=>row.status==='submitted').sort((a,b)=>new Date(a.submitted_at)-new Date(b.submitted_at)).map(decorate),
    recent:sectionSubmissions.filter(row=>row.status!=='submitted'&&row.reviewed_at).slice(0,8).map(decorate),
    taskCount:quests.length,
    section
  };
}

async function handleApi(req, res, url) {
  const path = url.pathname;

  if (req.method === 'POST' && path === '/api/login') {
    limitAuthentication(req);
    const body = await parseBody(req);
    const { data, error } = await createAuthClient().auth.signInWithPassword({
      email:String(body.email || '').trim(), password:String(body.password || '')
    });
    if (error || !data.session) throw new HttpError(401, 'Invalid email or password.');
    const { data:profile } = await admin.from('profiles').select('id,name,role,active').eq('id',data.user.id).single();
    if (!profile?.active) throw new HttpError(403, 'This account is not active.');
    return send(res, 200, {
      user:{ id:profile.id, name:profile.name, email:data.user.email, role:profile.role }
    }, { 'set-cookie': sessionCookies(data.session) });
  }

  if (req.method === 'POST' && path === '/api/refresh') {
    const body = await parseBody(req);
    const refreshToken = String(body.refreshToken || getCookies(req).rizlife_refresh || '');
    const { data, error } = await createAuthClient().auth.refreshSession({ refresh_token:refreshToken });
    if (error || !data.session) throw new HttpError(401, 'Please sign in again.');
    return send(res, 200, { ok: true }, { 'set-cookie': sessionCookies(data.session) });
  }

  if (req.method === 'POST' && path === '/api/logout') {
    const token = requireUser(req).catch(() => null);
    const body = await parseBody(req);
    const user = await token;
    const refreshToken = String(body.refreshToken || getCookies(req).rizlife_refresh || '');
    if (user && refreshToken) {
      const client = createAuthClient();
      await client.auth.setSession({ access_token: user.token, refresh_token: refreshToken });
      await client.auth.signOut({ scope: 'global' });
    }
    return send(res, 200, { ok: true }, { 'set-cookie': clearSessionCookies() });
  }

  if (req.method === 'GET' && path === '/api/me') {
    const user = await requireUser(req);
    return send(res, 200, { user:{ id:user.id, name:user.name, email:user.email, role:user.role } });
  }

  if (req.method === 'GET' && path === '/api/student/card') {
    const user = await requireUser(req, 'student');
    return send(res, 200, { quests:await studentCard(user.id) });
  }

  const submitMatch = path.match(/^\/api\/quests\/(\d+)\/submit$/);
  if (req.method === 'POST' && submitMatch) {
    const user = await requireUser(req, 'student');
    const questId = Number(submitMatch[1]);
    const { data:quest } = await admin.from('quests').select('id,section_id').eq('id',questId).eq('active',true).maybeSingle();
    if (!quest) throw new HttpError(404, 'Task not found.');
    const { data:enrollment } = await admin.from('section_students').select('student_id').eq('section_id',quest.section_id).eq('student_id',user.id).maybeSingle();
    if (!enrollment) throw new HttpError(403, 'You are not enrolled in this task’s class.');
    const current = (await latestSubmissions(user.id)).find(row=>Number(row.quest_id)===questId);
    if (current && current.status !== 'rejected') throw new HttpError(409, 'This task already has an active submission.');
    const body = await parseBody(req);
    const evidenceType = String(body.type || '');
    if (!['link','text','image'].includes(evidenceType)) throw new HttpError(400, 'Choose a valid evidence type.');
    let evidence;
    let uploadedPath = null;
    if (evidenceType === 'image') {
      const image = body.image || {};
      const mimeType = String(image.type || '').toLowerCase();
      const extension = imageTypes.get(mimeType);
      if (!extension) throw new HttpError(400, 'Upload a JPG, PNG, or WebP image.');
      const encoded = String(image.data || '').replace(/^data:[^;]+;base64,/, '');
      let buffer;
      try { buffer = Buffer.from(encoded, 'base64'); } catch { throw new HttpError(400, 'The image could not be read.'); }
      if (!buffer.length || buffer.length > 5 * 1024 * 1024) throw new HttpError(400, 'The image must be 5 MB or smaller.');
      if (!matchesImageSignature(buffer, mimeType)) throw new HttpError(400, 'The uploaded file does not match its image type.');
      uploadedPath = `${user.id}/${questId}/${randomUUID()}.${extension}`;
      const { error:uploadError } = await admin.storage.from(evidenceBucket).upload(uploadedPath, buffer, {
        contentType:mimeType,
        upsert:false,
      });
      if (uploadError) throw new HttpError(500, 'The image upload failed. Please try again.');
      evidence = uploadedPath;
    } else {
      evidence = assertText(body.evidence, 'Evidence');
      if (evidenceType === 'link') httpUrl(evidence);
    }
    const { error } = await admin.from('submissions').insert({ student_id:user.id, quest_id:questId, evidence_type:evidenceType, evidence });
    if (error) {
      if (uploadedPath) await admin.storage.from(evidenceBucket).remove([uploadedPath]);
      throw error;
    }
    return send(res, 201, { ok:true });
  }

  if (req.method === 'GET' && path === '/api/teacher/sections') {
    const teacher = await requireUser(req, 'teacher');
    const { data:sections, error } = await admin.from('sections').select('*').eq('teacher_id',teacher.id).eq('active',true).order('name');
    if (error) throw error;
    const { data:enrollments } = await admin.from('section_students').select('section_id');
    const { data:quests } = await admin.from('quests').select('section_id').eq('active',true);
    return send(res,200,{sections:sections.map(section=>({...section,studentCount:enrollments.filter(row=>Number(row.section_id)===Number(section.id)).length,taskCount:quests.filter(row=>Number(row.section_id)===Number(section.id)).length}))});
  }

  if (req.method === 'POST' && path === '/api/teacher/sections') {
    const teacher = await requireUser(req, 'teacher');
    const body = await parseBody(req);
    const name = assertText(body.name,'Class name',50);
    const { data,error } = await admin.from('sections').insert({teacher_id:teacher.id,name}).select('*').single();
    if (error?.code==='23505') throw new HttpError(409,'You already have a class with this name.');
    if (error) throw error;
    return send(res,201,data);
  }

  const sectionMatch = path.match(/^\/api\/teacher\/sections\/(\d+)$/);
  if (req.method === 'PATCH' && sectionMatch) {
    const teacher = await requireUser(req,'teacher');
    const section = await requireOwnedSection(teacher.id,sectionMatch[1]);
    const body = await parseBody(req);
    const name = assertText(body.name,'Class name',50);
    const { data,error } = await admin.from('sections').update({name}).eq('id',section.id).eq('teacher_id',teacher.id).select('*').single();
    if (error?.code==='23505') throw new HttpError(409,'You already have a class with this name.');
    if (error) throw error;
    return send(res,200,data);
  }

  if (req.method === 'DELETE' && sectionMatch) {
    const teacher = await requireUser(req,'teacher');
    const section = await requireOwnedSection(teacher.id,sectionMatch[1]);
    const { error } = await admin.from('sections').delete().eq('id',section.id).eq('teacher_id',teacher.id);
    if (error) throw error;
    return send(res,200,{ok:true});
  }

  const sectionStudentMatch = path.match(/^\/api\/teacher\/sections\/(\d+)\/students$/);
  if (req.method === 'POST' && sectionStudentMatch) {
    const teacher = await requireUser(req,'teacher');
    const section = await requireOwnedSection(teacher.id,sectionStudentMatch[1]);
    const body = await parseBody(req);
    const email = assertText(body.email,'Student email',200).toLowerCase();
    const password = assertText(body.password,'Temporary password',200);
    const name = assertText(body.name,'Student name',100);
    if (password.length < 8) throw new HttpError(400,'Temporary password must be at least 8 characters.');
    const { data:created,error:createError } = await admin.auth.admin.createUser({email,password,email_confirm:true});
    if (createError) throw new HttpError(400,createError.message);
    try {
      const { error:profileError } = await admin.from('profiles').insert({id:created.user.id,name,role:'student'});
      if (profileError) throw profileError;
      const { error:enrollmentError } = await admin.from('section_students').insert({section_id:section.id,student_id:created.user.id});
      if (enrollmentError) throw enrollmentError;
    } catch(error) {
      await admin.auth.admin.deleteUser(created.user.id);
      throw error;
    }
    return send(res,201,{id:created.user.id,name,email});
  }

  const enrollmentMatch = path.match(/^\/api\/teacher\/sections\/(\d+)\/students\/([0-9a-f-]+)$/i);
  if (req.method === 'DELETE' && enrollmentMatch) {
    const teacher = await requireUser(req,'teacher');
    const section = await requireOwnedSection(teacher.id,enrollmentMatch[1]);
    const { error } = await admin.from('section_students').delete().eq('section_id',section.id).eq('student_id',enrollmentMatch[2]);
    if (error) throw error;
    return send(res,200,{ok:true});
  }

  if (req.method === 'GET' && path === '/api/teacher/dashboard') {
    const teacher = await requireUser(req, 'teacher');
    return send(res, 200, await dashboardData(teacher.id,url.searchParams.get('sectionId')));
  }

  const studentMatch = path.match(/^\/api\/teacher\/students\/([0-9a-f-]+)$/i);
  if (req.method === 'GET' && studentMatch) {
    const teacher = await requireUser(req, 'teacher');
    const section = await requireOwnedSection(teacher.id,url.searchParams.get('sectionId'));
    const { data:membership } = await admin.from('section_students').select('student_id').eq('section_id',section.id).eq('student_id',studentMatch[1]).maybeSingle();
    if (!membership) throw new HttpError(404,'Student is not enrolled in this class.');
    const { data:student } = await admin.from('profiles').select('id,name').eq('id',studentMatch[1]).eq('role','student').maybeSingle();
    if (!student) throw new HttpError(404, 'Student not found.');
    return send(res, 200, { student:{...student,email:''}, quests:await studentCard(student.id) });
  }

  const reviewMatch = path.match(/^\/api\/teacher\/submissions\/(\d+)$/);
  if (req.method === 'PATCH' && reviewMatch) {
    const teacher = await requireUser(req, 'teacher');
    const body = await parseBody(req);
    const section = await requireOwnedSection(teacher.id,body.sectionId);
    const { data:submission } = await admin.from('submissions').select('id,quest_id').eq('id',Number(reviewMatch[1])).maybeSingle();
    if (!submission) throw new HttpError(404,'Submission not found.');
    const { data:sectionQuest } = await admin.from('quests').select('id').eq('id',submission.quest_id).eq('section_id',section.id).maybeSingle();
    if (!sectionQuest) throw new HttpError(403,'This submission belongs to another class.');
    const status = String(body.status || '');
    const feedback = String(body.feedback || '').trim();
    if (!['verified','rejected'].includes(status)) throw new HttpError(400, 'Invalid review decision.');
    if (status === 'rejected' && !feedback) throw new HttpError(400, 'Feedback is required when returning work.');
    const { data, error } = await admin.from('submissions').update({
      status,
      feedback:feedback || 'Requirement verified.',
      reviewed_at:new Date().toISOString(),
      reviewed_by:teacher.id
    }).eq('id',Number(reviewMatch[1])).eq('status','submitted').select('id').maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(409, 'This submission has already been reviewed.');
    return send(res, 200, { ok:true });
  }

  if (req.method === 'GET' && path === '/api/teacher/quests') {
    const teacher = await requireUser(req, 'teacher');
    const section = await requireOwnedSection(teacher.id,url.searchParams.get('sectionId'));
    const { data, error } = await admin.from('quests').select('*').eq('section_id',section.id).order('active',{ascending:false}).order('id');
    if (error) throw error;
    return send(res, 200, { quests:data });
  }

  if (req.method === 'POST' && path === '/api/teacher/quests') {
    const teacher = await requireUser(req, 'teacher');
    const body = await parseBody(req);
    const section = await requireOwnedSection(teacher.id,body.sectionId);
    const record = {
      title:assertText(body.title,'Task title',120),
      description:assertText(body.description,'Instructions',2000),
      requirement:assertText(body.requirement,'Evidence requirement',500),
      created_by:teacher.id,
      section_id:section.id
    };
    const { data, error } = await admin.from('quests').insert(record).select('id').single();
    if (error) throw error;
    return send(res, 201, data);
  }

  const questMatch = path.match(/^\/api\/teacher\/quests\/(\d+)$/);
  if (req.method === 'PUT' && questMatch) {
    const teacher = await requireUser(req, 'teacher');
    const body = await parseBody(req);
    const section = await requireOwnedSection(teacher.id,body.sectionId);
    const { error } = await admin.from('quests').update({
      title:assertText(body.title,'Task title',120),
      description:assertText(body.description,'Instructions',2000),
      requirement:assertText(body.requirement,'Evidence requirement',500)
    }).eq('id',Number(questMatch[1])).eq('section_id',section.id);
    if (error) throw error;
    return send(res, 200, { ok:true });
  }

  const statusMatch = path.match(/^\/api\/teacher\/quests\/(\d+)\/status$/);
  if (req.method === 'PATCH' && statusMatch) {
    const teacher = await requireUser(req, 'teacher');
    const body = await parseBody(req);
    const section = await requireOwnedSection(teacher.id,body.sectionId);
    if (typeof body.active !== 'boolean') throw new HttpError(400, 'Active status is required.');
    const { error } = await admin.from('quests').update({ active:body.active }).eq('id',Number(statusMatch[1])).eq('section_id',section.id);
    if (error) throw error;
    return send(res, 200, { ok:true });
  }

  throw new HttpError(404, 'API route not found.');
}

const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8' };
export async function handleRequest(req,res) {
  try {
    setSecurityHeaders(res);
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) return await handleApi(req,res,url);
    const filePath = normalize(join(root, url.pathname === '/' ? 'index.html' : url.pathname.slice(1)));
    const pathFromRoot = relative(root, filePath);
    if (pathFromRoot.startsWith('..') || isAbsolute(pathFromRoot)) throw new HttpError(403, 'Forbidden.');
    const file = await readFile(filePath);
    res.writeHead(200, { 'content-type':mime[extname(filePath)] || 'application/octet-stream' });
    res.end(file);
  } catch (error) {
    if (res.headersSent) return res.end();
    if (req.url?.startsWith('/api/')) {
      if (!error.status) console.error(error);
      return send(res, error.status || 500, { error:error.status ? error.message : 'The server could not complete the request.' });
    }
    res.writeHead(error.status || 404);
    res.end(error.message || 'Not found');
  }
}
