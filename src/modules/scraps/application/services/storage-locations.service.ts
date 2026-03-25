import { Injectable } from "@nestjs/common";
import { PrismaScrapsRepository } from "../../infrastructure/persistence/prisma/prisma-scraps.repository";

@Injectable()
export class StorageLocationsService {
  constructor(private readonly scrapsRepo: PrismaScrapsRepository) {}

  list(branchCode: string, page = 1, limit = 50) {
    return this.scrapsRepo.listStorageLocations(branchCode, page, limit);
  }

  bulkCreate(input: {
    branchCode: string;
    rowMode: "LETTER" | "FIXED";
    rowStart: string;
    rowEnd: string;
    colStart: number;
    colEnd: number;
    separator: string;
    descriptionTemplate?: string;
    createdByEmail: string;
  }) {
    return this.scrapsRepo.bulkCreateStorageLocations(input);
  }

  bulkPreview(input: {
    branchCode: string;
    rowMode: "LETTER" | "FIXED";
    rowStart: string;
    rowEnd: string;
    colStart: number;
    colEnd: number;
    separator: string;
    descriptionTemplate?: string;
  }) {
    return this.scrapsRepo.bulkPreviewStorageLocations(input);
  }

  create(input: { branchCode: string; code: string; description?: string; createdByEmail: string }) {
    return this.scrapsRepo.createStorageLocation(input);
  }

  update(id: string, input: { code?: string; description?: string; actorEmail: string }) {
    return this.scrapsRepo.updateStorageLocation(id, input);
  }

  delete(id: string, actorEmail: string) {
    return this.scrapsRepo.deleteStorageLocation(id, actorEmail);
  }

  toggleStatus(id: string, actorEmail: string) {
    return this.scrapsRepo.toggleStorageLocationStatus(id, actorEmail);
  }
}
