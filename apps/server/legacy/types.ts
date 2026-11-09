export interface AdminSession {
  id: number;
  username: string;
  nickname: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    adminUser?: AdminSession;
  }
}

export {};
