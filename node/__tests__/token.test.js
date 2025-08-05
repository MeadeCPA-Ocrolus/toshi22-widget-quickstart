const request = require('supertest');
const app = require('../index');

// Helper for type checking
const isString = val => typeof val === 'string' && val.length > 0;

describe('API Endpoints', () => {

  describe('POST /token', () => {
    it('should return 200 and an accessToken with valid credentials', async () => {
      const res = await request(app)
        .post('/token')
        .send({ custom_id: 'testUser', bookName: 'Test Book' })
        .set('Accept', 'application/json');

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(isString(res.body.accessToken)).toBe(true);
    });

    it('should return 200 and use default-user if custom_id is missing', async () => {
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        const res = await request(app)
            .post('/token')
            .send({})// No custom_id or bookName
            .set('Accept', 'application/json');
        expect(res.statusCode).toBe(200);
        expect(logSpy).toHaveBeenCalledWith('Token Acquired for', 'default-user');
        logSpy.mockRestore();
    });
  });

  // ------------------------------
  // /books
  // ------------------------------
  describe('GET /books', () => {
    it('should return 200 and an array of books', async () => {
      const res = await request(app).get('/books');
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('response');
      expect(Array.isArray(res.body.response.books)).toBe(true);

      if (res.body.response.books.length > 0) {
        const book = res.body.response.books[0];
        expect(book).toHaveProperty('name');
        expect(book).toHaveProperty('book_uuid');
      }
    });
  });

  // ------------------------------
  // /webhook-logs
  // ------------------------------
  describe('GET /webhook-logs', () => {
    it('should return 200 and an array', async () => {
      const res = await request(app).get('/webhook-logs');
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ------------------------------
  // /handler
  // ------------------------------
  describe('POST /handler', () => {
    it('should return 401 if IP is not allowlisted', async () => {
      const res = await request(app)
        .post('/handler')
        .set('x-forwarded-for', '1.2.3.4') // Not in allowlist
        .send({
          event_name: 'document.verification_succeeded',
          book_uuid: 'fake-book',
          doc_uuid: 'fake-doc'
        });

      expect(res.statusCode).toBe(401);
    });

    it('should ignore unsupported events', async () => {
      const res = await request(app)
        .post('/handler')
        .set('x-forwarded-for', '18.205.30.63') // Allowlisted
        .send({
          event_name: 'unsupported_event',
          book_uuid: 'fake-book',
          doc_uuid: 'fake-doc'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'Unhandled event');
    });
  });

});