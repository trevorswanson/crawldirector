import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient, Role } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = "dm@example.com";
  const passwordHash = await bcrypt.hash("password123", 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "Demo DM", passwordHash },
  });

  const existing = await prisma.campaign.findFirst({
    where: { ownerId: user.id, name: "Demo Campaign" },
  });
  if (!existing) {
    await prisma.campaign.create({
      data: {
        name: "Demo Campaign",
        summary: "A sample world to poke at.",
        ownerId: user.id,
        members: { create: { userId: user.id, role: Role.OWNER } },
      },
    });
  }

  console.log(`Seeded user ${email} (password: password123)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
