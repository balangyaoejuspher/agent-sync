import { prisma } from "./db";
export async function getUser(id: string) {
  const u = await prisma.user.findUnique({ where: { id } });
  const posts = await prisma.post.findMany({ where: { authorId: id } });
  return { u, posts };
}
