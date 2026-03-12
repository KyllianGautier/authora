import {
  BadRequestException,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { SignInInputDto } from '../dto/input/sign-in.input.dto';
import { SignInOutputDto } from '../dto/output/sign-in.output.dto';
import { PasswordEntityService } from './entity-service/password-entity.service';
import { RefreshTokenEntityService } from './entity-service/refresh-token-entity.service';
import { UserEntityService } from './entity-service/user-entity.service';

export interface SignInResult {
  body: SignInOutputDto;
  refreshToken: string;
}

@Injectable()
export class SignInService {
  constructor(
    private readonly _userEntityService: UserEntityService,
    private readonly _passwordEntityService: PasswordEntityService,
    private readonly _refreshTokenEntityService: RefreshTokenEntityService,
    private readonly _jwtService: JwtService,
    private readonly _configService: ConfigService
  ) {}

  async signIn(dto: SignInInputDto): Promise<SignInResult> {
    const email = dto.email.toLowerCase();

    // Find the user and verify the password
    const user = await this._userEntityService.findByEmailWithPasswords(email);

    if (user === null) {
      throw new InvalidCredentialsException();
    }

    const isPasswordValid =
      await this._passwordEntityService.verifyUserPassword(user, dto.password);

    if (!isPasswordValid) {
      throw new InvalidCredentialsException();
    }

    // Generate the access token
    const expiresIn = this._configService.getOrThrow<number>(
      'JWT_ACCESS_TOKEN_EXPIRATION_SECONDS'
    );

    const accessToken = await this._jwtService.signAsync({
      sub: user.id,
      email: user.email
    });

    // Generate the refresh token with expiration based on rememberMe
    const refreshTokenExpirationSeconds =
      this._configService.getOrThrow<number>(
        dto.rememberMe
          ? 'JWT_REFRESH_TOKEN_LONG_EXPIRATION_SECONDS'
          : 'JWT_REFRESH_TOKEN_SHORT_EXPIRATION_SECONDS'
      );

    const refreshToken = await this._refreshTokenEntityService.create(
      user,
      refreshTokenExpirationSeconds
    );

    return {
      body: { accessToken, type: 'Bearer', expiresIn },
      refreshToken
    };
  }

  async refresh(
    accessToken: string,
    clearRefreshToken: string
  ): Promise<SignInResult> {
    // Verify the JWT is expired — if still valid, the client should use it
    const payload = this._verifyExpiredToken(accessToken);

    if (payload === null) {
      throw new BadRequestException('Access token is not yet expired');
    }

    // Find the user
    const user = await this._userEntityService.findById(payload.sub);

    if (user === null) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Find the active refresh token for this user
    const refreshToken =
      await this._refreshTokenEntityService.findActiveByUser(user.id);

    if (refreshToken === null) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Verify the refresh token hash and expiration
    const isValid = await this._refreshTokenEntityService.verify(
      refreshToken,
      clearRefreshToken
    );

    if (!isValid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Generate new access token
    const expiresIn = this._configService.getOrThrow<number>(
      'JWT_ACCESS_TOKEN_EXPIRATION_SECONDS'
    );

    const newAccessToken = await this._jwtService.signAsync({
      sub: user.id,
      email: user.email
    });

    // Rotate the refresh token (same expiration date as the previous one)
    const newRefreshToken = await this._refreshTokenEntityService.rotate(
      refreshToken,
      user
    );

    return {
      body: { accessToken: newAccessToken, type: 'Bearer', expiresIn },
      refreshToken: newRefreshToken
    };
  }

  private _verifyExpiredToken(
    token: string
  ): { sub: string; email: string } | null {
    try {
      // If verification succeeds, the token is still valid
      this._jwtService.verify(token);
      return null;
    } catch (error) {
      // Only accept TokenExpiredError — any other error means the token is invalid
      if (error instanceof Error && error.name === 'TokenExpiredError') {
        return this._jwtService.verify<{ sub: string; email: string }>(token, {
          ignoreExpiration: true
        });
      }
      throw new UnauthorizedException('Invalid access token');
    }
  }
}

export class InvalidCredentialsException extends UnauthorizedException {
  constructor() {
    super('Invalid credentials');
  }
}
