import type { ClockPort } from "../../application/ports/clock.port";

export class SystemClockService implements ClockPort {
  now(): Date {
    return new Date();
  }
}
