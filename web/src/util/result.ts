import { formatError } from '@/api';

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: { message: string } };

export const Ok = <T>(data: T): Result<T> => {
  return { ok: true, value: data };
};

export const Err = (error: string): Result<never> => {
  return { ok: false, error: { message: error } };
};

export const runCatching = <T>(callback: Promise<T>): Promise<Result<T>> => {
  return callback
    .then((it) => Ok(it))
    .catch(async (error: unknown) => Err(await formatError(error)));
};
