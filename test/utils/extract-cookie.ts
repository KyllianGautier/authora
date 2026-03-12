import request from 'supertest';

export function extractCookie(
  res: request.Response,
  name: string
): { value: string; flags: string } | undefined {
  const cookies = res.headers['set-cookie'] as string[] | undefined;
  if (cookies === undefined) return undefined;
  const cookie = cookies.find((c: string) => c.startsWith(`${name}=`));
  if (cookie === undefined) return undefined;
  const value = cookie.split(';')[0].split('=')[1];
  return { value, flags: cookie };
}
