import * as crypto from 'crypto';

interface AuthCheckResult {
    allowed: boolean;
    status?: number;
    error?: string;
}

function checkAuth(
    requireAuth: boolean,
    serverToken: string,
    authHeader: string | undefined,
    queryToken: string | undefined,
): AuthCheckResult {
    if (!requireAuth) {
        return { allowed: true };
    }
    if (!serverToken) {
        return { allowed: false, status: 500, error: 'Server misconfigured: no auth token.' };
    }
    let clientToken: string | undefined;
    if (authHeader?.startsWith('Bearer ')) {
        clientToken = authHeader.slice(7);
    } else if (typeof queryToken === 'string') {
        clientToken = queryToken;
    }
    if (!clientToken || clientToken.length === 0) {
        return { allowed: false, status: 403, error: 'Unauthorized.' };
    }
    const serverBuf = Buffer.from(serverToken);
    const clientBuf = Buffer.from(clientToken);
    if (serverBuf.length !== clientBuf.length || !crypto.timingSafeEqual(serverBuf, clientBuf)) {
        return { allowed: false, status: 403, error: 'Unauthorized.' };
    }
    return { allowed: true };
}

describe('auth middleware logic', () => {
    const TOKEN = 'abc123';

    test('requireAuth=false bypasses all validation', () => {
        const result = checkAuth(false, '', undefined, undefined);
        expect(result).toEqual({ allowed: true });
    });

    test('requireAuth=true with valid Bearer token allows request', () => {
        const result = checkAuth(true, TOKEN, `Bearer ${TOKEN}`, undefined);
        expect(result).toEqual({ allowed: true });
    });

    test('requireAuth=true with valid query token allows request', () => {
        const result = checkAuth(true, TOKEN, undefined, TOKEN);
        expect(result).toEqual({ allowed: true });
    });

    test('requireAuth=true with no token rejects with 403', () => {
        const result = checkAuth(true, TOKEN, undefined, undefined);
        expect(result).toEqual({ allowed: false, status: 403, error: 'Unauthorized.' });
    });

    test('requireAuth=true with wrong token rejects with 403', () => {
        const result = checkAuth(true, TOKEN, 'Bearer wrong', undefined);
        expect(result).toEqual({ allowed: false, status: 403, error: 'Unauthorized.' });
    });

    test('requireAuth=true with no server token rejects with 500', () => {
        const result = checkAuth(true, '', undefined, undefined);
        expect(result).toEqual({ allowed: false, status: 500, error: 'Server misconfigured: no auth token.' });
    });
});
