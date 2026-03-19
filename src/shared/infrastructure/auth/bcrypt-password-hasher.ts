import { Injectable } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import type { PasswordHasherPort } from "../../application/ports/password-hasher.port";

@Injectable()
export class BcryptPasswordHasher implements PasswordHasherPort {
  private readonly ROUNDS = 12;

  async hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.ROUNDS);
  }

  async verify(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
