import { HasMinLengthConstraint } from './has-min-length.decorator';
import { HasDigitConstraint } from './has-digit.decorator';
import { HasSpecialCharConstraint } from './has-special-char.decorator';
import { HasLowercaseConstraint } from './has-lowercase.decorator';
import { HasUppercaseConstraint } from './has-uppercase.decorator';
import { NoSequentialCharsConstraint } from './no-sequential-chars.decorator';
import { NoRepeatedCharsConstraint } from './no-repeated-chars.decorator';
import { NoKeyboardSequenceConstraint } from './no-keyboard-sequence.decorator';
import { NoUserInfoConstraint } from './no-user-info.decorator';
import { NoCommonPasswordConstraint } from './no-common-password.decorator';

export { HasMinLength, HasMinLengthConstraint } from './has-min-length.decorator';
export { HasDigit, HasDigitConstraint } from './has-digit.decorator';
export { HasSpecialChar, HasSpecialCharConstraint, SPECIAL_CHARS } from './has-special-char.decorator';
export { HasLowercase, HasLowercaseConstraint } from './has-lowercase.decorator';
export { HasUppercase, HasUppercaseConstraint } from './has-uppercase.decorator';
export { NoSequentialChars, NoSequentialCharsConstraint } from './no-sequential-chars.decorator';
export { NoRepeatedChars, NoRepeatedCharsConstraint } from './no-repeated-chars.decorator';
export { NoKeyboardSequence, NoKeyboardSequenceConstraint, KEYBOARD_ROWS } from './no-keyboard-sequence.decorator';
export { NoUserInfo, NoUserInfoConstraint } from './no-user-info.decorator';
export { NoCommonPassword, NoCommonPasswordConstraint } from './no-common-password.decorator';

export const PASSWORD_CONSTRAINTS = [
  HasMinLengthConstraint,
  HasDigitConstraint,
  HasSpecialCharConstraint,
  HasLowercaseConstraint,
  HasUppercaseConstraint,
  NoSequentialCharsConstraint,
  NoRepeatedCharsConstraint,
  NoKeyboardSequenceConstraint,
  NoUserInfoConstraint,
  NoCommonPasswordConstraint
];
