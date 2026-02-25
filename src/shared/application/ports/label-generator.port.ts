export interface LabelGeneratorPort {
  generateLabelPdf(input: { labelId: string; payload: unknown }): Promise<Buffer>;
}
