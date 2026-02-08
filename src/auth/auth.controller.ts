import { Controller, Post, Body, BadRequestException, HttpCode, HttpStatus } from '@nestjs/common';

interface LoginDto {
  username: string;
  password: string;
}

interface LoginResponse {
  status: string;
  user: string;
}

@Controller('auth')
export class AuthController {
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: LoginDto): LoginResponse {
    if (!body.username || !body.password) {
      throw new BadRequestException('Username and password are required');
    }

    return {
      status: 'logged_in',
      user: body.username,
    };
  }
}
