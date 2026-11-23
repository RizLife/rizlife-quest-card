import { HttpError, getBearerToken, getCookies } from './http.mjs';

export function createAuthorizer({ admin, createAuthClient }) {
  return async function requireUser(request, requiredRole) {
    const token = getBearerToken(request) || getCookies(request).rizlife_access;
    if (!token) throw new HttpError(401, 'Please sign in.');

    const { data: { user }, error } = await createAuthClient().auth.getUser(token);
    if (error || !user) throw new HttpError(401, 'Your session has expired. Please sign in again.');

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('id,name,role,active,student_number,avatar_path')
      .eq('id', user.id)
      .single();
    if (profileError || !profile?.active) throw new HttpError(403, 'This account is not active.');
    if (requiredRole && profile.role !== requiredRole) {
      throw new HttpError(403, 'You do not have permission for this action.');
    }
    return { ...profile, email: user.email, token };
  };
}
