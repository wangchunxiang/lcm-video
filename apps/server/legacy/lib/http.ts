import type { FastifyReply } from 'fastify';

export const ErrorCode = {
  BAD_REQUEST: 40000,
  UNAUTHORIZED: 40100,
  FORBIDDEN: 40300,
  NOT_FOUND: 40400,
  SERVER_ERROR: 50000,
} as const;

export interface ApiBody<T> {
  code: number;
  msg: string;
  data: T;
}

export function ok<T>(reply: FastifyReply, data: T, msg = 'ok'): FastifyReply {
  return reply.code(200).send({ code: 0, msg, data } satisfies ApiBody<T>);
}

export function fail(
  reply: FastifyReply,
  status: number,
  code: number,
  msg: string,
): FastifyReply {
  return reply.code(status).send({ code, msg, data: null });
}
