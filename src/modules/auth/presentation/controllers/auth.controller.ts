import { Body, Controller, Post } from "@nestjs/common";
import { LoginUseCase } from "../../application/use-cases/login.use-case";
import { LoginDto } from "../dto/login.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly loginUseCase: LoginUseCase) {}

  @Post("login")
  async login(@Body() body: LoginDto) {
    return this.loginUseCase.execute(body.email, body.password);
  }
}
