import { existsSync } from 'fs';
import * as Joi from 'joi';

export const filePath = Joi.string()
  .custom((value, helpers) => {
    if (!existsSync(value)) {
      return helpers.message({
        custom: '{{#label}} points to a file that does not exist: ' + value
      } as never);
    }
    return value;
  }, 'file existence check');
