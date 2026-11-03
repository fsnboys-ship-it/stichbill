import type { OpenAPIObject } from '@nestjs/swagger';
// Fastify handlers are registered outside Nest's decorators; publish their contract explicitly.
export function addAuthContract(document: OpenAPIObject) {
  const text = { type: 'string' as const };
  const password = { ...text, minLength: 12, maxLength: 128, writeOnly: true };
  const email = { ...text, format: 'email', maxLength: 254 };
  const token = { ...text, pattern: '^[a-f0-9]{64}$', writeOnly: true };
  const bodies = {
    register: { email, password }, login: { email, password }, recover: { email }, reset: { token, password },
    onboard: { businessName: { ...text, minLength: 1, maxLength: 160 }, ownerName: { ...text, minLength: 1, maxLength: 160 } }, logout: {},
  };
  for (const [name, properties] of Object.entries(bodies)) {
    document.paths[`/api/v1/auth/${name}`] = { post: {
      operationId: `owner_${name}`, tags: ['Owner access'], summary: name,
      description: 'Requires an allowed Origin, the HttpOnly CSRF cookie, and its matching X-CSRF-Token header. Authentication uses an opaque HttpOnly Secure SameSite=Strict cookie. Registration and recovery use generic responses.',
      parameters: [{ name: 'X-CSRF-Token', in: 'header', required: true, schema: text }],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: Object.keys(properties), properties } } } },
      responses: { '200': { description: 'Completed; login and registration return a rotated csrf token. Recovery always returns the same public message.' },
        '400': { description: 'Invalid input or reset token' }, '401': { description: 'Authentication failed' }, '403': { description: 'CSRF validation failed' }, '409': { description: 'Onboarding unavailable' }, '429': { description: 'Try again after the 15 minute throttle window' } },
    } };
  }
  document.paths['/api/v1/auth/csrf'] = { get: { operationId: 'owner_csrf', tags: ['Owner access'], responses: { '200': { description: 'Sets CSRF cookie and returns csrf for the request header', content: { 'application/json': { schema: { type: 'object', required: ['csrf'], properties: { csrf: text } } } } } } } };
  document.paths['/api/v1/auth/session'] = { get: { operationId: 'owner_session', tags: ['Owner access'], responses: {
    '200': { description: 'Only active business memberships from the authenticated server session', content: { 'application/json': { schema: { type: 'object', required: ['businesses'], properties: { businesses: { type: 'array', items: { type: 'object', required: ['id', 'name'], properties: { id: { ...text, format: 'uuid' }, name: text } } } } } } } }, '401': { description: 'Invalid or expired session' },
  } } };
  document.paths['/api/v1/auth/business/{id}'] = { get: { operationId: 'owner_business', tags: ['Owner access'], parameters: [{ name: 'id', in: 'path', required: true, schema: { ...text, format: 'uuid' } }], responses: { '200': { description: 'Business read under transaction-scoped session and RLS context' }, '403': { description: 'No active membership context' } } } };
}
