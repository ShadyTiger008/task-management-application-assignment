import { Controller, Post, Body, UsePipes, UseGuards, Request, HttpCode, HttpStatus, Req, Res, UnauthorizedException } from '@nestjs/common';
import * as express from 'express';
import { AuthService } from './auth.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { SignupSchema, SignupDto, LoginSchema, LoginDto } from './auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: false, // Set to true in production if HTTPS is used
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
};

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('signup')
  @UsePipes(new ZodValidationPipe(SignupSchema))
  async signup(
    @Body() dto: SignupDto,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const result = await this.authService.signup(dto);
    res.cookie('refreshToken', result.refreshToken, COOKIE_OPTIONS);
    return {
      user: result.user,
      accessToken: result.accessToken,
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(LoginSchema))
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const result = await this.authService.login(dto);
    res.cookie('refreshToken', result.refreshToken, COOKIE_OPTIONS);
    return {
      user: result.user,
      accessToken: result.accessToken,
    };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: any,
    @Request() req: any,
    @Req() expressReq: express.Request,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const refreshToken = expressReq.cookies['refreshToken'];
    const result = await this.authService.logout(user.id, req.token, refreshToken);
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
    });
    return result;
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const result = await this.authService.logoutAll(user.id);
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
    });
    return result;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: express.Request,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const refreshToken = req.cookies['refreshToken'];
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }
    const result = await this.authService.refreshToken(refreshToken);
    res.cookie('refreshToken', result.refreshToken, COOKIE_OPTIONS);
    return {
      accessToken: result.accessToken,
    };
  }
}
