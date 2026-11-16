import { redact, describeError } from '../shared/safe-log';
import { allowOriginHeader } from '../shared/http';

describe('redact', () => {
    it('masks Plaid tokens', () => {
        const out = redact('token access-production-1234abcd-5678-90ef-aaaa-bbbbccccdddd failed');
        expect(out).not.toContain('1234abcd');
        expect(out).toContain('[REDACTED_PLAID_TOKEN]');
    });
    it('masks connection string secrets and SAS signatures', () => {
        const out = redact('AccountKey=abc123SECRET==;Password=hunter2;https://x/y?sig=ZZZSIGNATURE123456');
        expect(out).not.toContain('abc123SECRET');
        expect(out).not.toContain('hunter2');
        expect(out).not.toContain('ZZZSIGNATURE123456');
    });
    it('masks email addresses and bearer tokens', () => {
        const out = redact('user jane@example.com used Bearer abcdefghijklmnop1234');
        expect(out).not.toContain('jane@example.com');
        expect(out).not.toContain('abcdefghijklmnop1234');
    });
    it('truncates very long text', () => {
        expect(redact('x'.repeat(2000)).length).toBeLessThan(600);
    });
});

describe('describeError', () => {
    it('keeps only safe Plaid fields and never the request config or headers', () => {
        const err: any = new Error('Request failed with status code 400');
        err.config = { headers: { 'PLAID-SECRET': 'topsecretvalue' }, data: '{"client_id":"abc"}' };
        err.response = {
            status: 400,
            headers: { authorization: 'Bearer should-not-appear' },
            data: { error_type: 'INVALID_REQUEST', error_code: 'INVALID_FIELD', request_id: 'req-1', error_message: 'contains jane@example.com' },
        };
        const text = JSON.stringify(describeError(err));
        expect(text).toContain('INVALID_FIELD');
        expect(text).toContain('req-1');
        expect(text).not.toContain('topsecretvalue');
        expect(text).not.toContain('should-not-appear');
        expect(text).not.toContain('jane@example.com');
    });
    it('handles non-Error values', () => {
        expect(describeError('boom').name).toBe('NonError');
    });
});

describe('allowOriginHeader', () => {
    const saved = { ...process.env };
    afterEach(() => { process.env = { ...saved }; });
    it('uses ALLOWED_ORIGIN when set', () => {
        process.env.ALLOWED_ORIGIN = 'https://app.example.com';
        expect(allowOriginHeader()['Access-Control-Allow-Origin']).toBe('https://app.example.com');
    });
    it('sends no wildcard on a deployed app without ALLOWED_ORIGIN', () => {
        delete process.env.ALLOWED_ORIGIN;
        process.env.WEBSITE_INSTANCE_ID = 'abc';
        expect(allowOriginHeader()).toEqual({});
    });
    it('allows * only for local development', () => {
        delete process.env.ALLOWED_ORIGIN;
        delete process.env.WEBSITE_INSTANCE_ID;
        expect(allowOriginHeader()['Access-Control-Allow-Origin']).toBe('*');
    });
});
