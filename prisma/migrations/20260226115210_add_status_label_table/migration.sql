-- CreateTable
CREATE TABLE "status_label" (
    "id" SERIAL NOT NULL,
    "entity_type" VARCHAR(40) NOT NULL,
    "status_code" VARCHAR(40) NOT NULL,
    "label_es" VARCHAR(80) NOT NULL,
    "description_es" TEXT NOT NULL,

    CONSTRAINT "status_label_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "status_label_entity_type_status_code_key" ON "status_label"("entity_type", "status_code");
