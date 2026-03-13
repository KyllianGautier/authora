import { SetMetadata } from '@nestjs/common';

export const DELAY_KEY = 'delay';

export const Delay = () => SetMetadata(DELAY_KEY, true);
