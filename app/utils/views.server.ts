import { prisma } from "./prisma.server";
import { requireUserId } from "./auth.server";

export type SavedViewParams = {
  module: string; // e.g., "products"
  name: string;
  params: Record<string, any>;
};

export type ViewUser = {
  id: number;
  isAdmin: boolean;
};

export type ViewSummary = {
  id: number;
  module: string;
  name: string;
  params: Record<string, any>;
  isGlobal: boolean;
  isLocked: boolean;
  ownerUserId: number | null;
  editable: boolean;
};

const isEditableForUser = (view: any, user: ViewUser | null) => {
  if (!user) return false;
  if (view.isGlobal) {
    if (!user.isAdmin) return false;
    if (view.isLocked && !user.isAdmin) return false;
    return true;
  }
  if (view.ownerUserId == null) {
    return user.isAdmin;
  }
  if (view.ownerUserId === user.id) return true;
  return user.isAdmin;
};

const assertViewModule = (view: any, module?: string | null) => {
  if (module && view.module !== module) {
    throw new Response("View not found", { status: 404 });
  }
};

export async function getViewUser(request: Request): Promise<ViewUser> {
  const userId = await requireUserId(request);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { userLevel: true },
  });
  return {
    id: userId,
    isAdmin: (user?.userLevel as string | null) === "Admin",
  };
}

export async function listViews(
  module: string,
  user?: ViewUser | null
): Promise<ViewSummary[]> {
  const views = await prisma.savedView.findMany({
    where: user
      ? { module, OR: [{ isGlobal: true }, { ownerUserId: user.id }] }
      : { module, isGlobal: true },
    orderBy: { updatedAt: "desc" },
  });
  return views.map((view) => ({
    ...view,
    editable: isEditableForUser(view, user ?? null),
  }));
}

export async function getView(module: string, viewIdOrName: string) {
  const id = Number(viewIdOrName);
  if (Number.isFinite(id)) {
    return prisma.savedView.findFirst({ where: { module, id } });
  }
  return prisma.savedView.findFirst({ where: { module, name: viewIdOrName } });
}

export async function getViewById(viewId: string) {
  const id = Number(viewId);
  if (!Number.isFinite(id)) return null;
  return prisma.savedView.findUnique({ where: { id } });
}

export function findViewByParam(views: ViewSummary[], viewParam: string | null) {
  if (!viewParam) return null;
  const numeric = Number(viewParam);
  if (Number.isFinite(numeric)) {
    return views.find((v) => v.id === numeric) || null;
  }
  return views.find((v) => v.name === viewParam) || null;
}

export async function saveView({
  module,
  name,
  params,
  user,
}: SavedViewParams & { user: ViewUser }) {
  return prisma.savedView.create({
    data: {
      module,
      name,
      params,
      ownerUserId: user.id,
      isGlobal: false,
      isLocked: false,
      createdBy: String(user.id),
      modifiedBy: String(user.id),
    },
  });
}

export async function updateViewParams({
  viewId,
  params,
  user,
  module,
}: {
  viewId: string;
  params: Record<string, any>;
  user: ViewUser;
  module?: string | null;
}) {
  const view =
    (await getViewById(viewId)) || (module ? await getView(module, viewId) : null);
  if (!view) throw new Response("View not found", { status: 404 });
  assertViewModule(view, module);
  if (!isEditableForUser(view, user) || (view.isLocked && !user.isAdmin)) {
    throw new Response("View not editable", { status: 403 });
  }
  return prisma.savedView.update({
    where: { id: view.id },
    data: { params, modifiedBy: String(user.id) },
  });
}

export async function renameView({
  viewId,
  name,
  user,
  module,
}: {
  viewId: string;
  name: string;
  user: ViewUser;
  module?: string | null;
}) {
  const view =
    (await getViewById(viewId)) || (module ? await getView(module, viewId) : null);
  if (!view) throw new Response("View not found", { status: 404 });
  assertViewModule(view, module);
  if (!isEditableForUser(view, user) || (view.isLocked && !user.isAdmin)) {
    throw new Response("View not editable", { status: 403 });
  }
  return prisma.savedView.update({
    where: { id: view.id },
    data: { name, modifiedBy: String(user.id) },
  });
}

export async function deleteView({
  viewId,
  user,
  module,
}: {
  viewId: string;
  user: ViewUser;
  module?: string | null;
}) {
  const view =
    (await getViewById(viewId)) || (module ? await getView(module, viewId) : null);
  if (!view) throw new Response("View not found", { status: 404 });
  assertViewModule(view, module);
  if (!isEditableForUser(view, user) || (view.isLocked && !user.isAdmin)) {
    throw new Response("View not editable", { status: 403 });
  }
  return prisma.savedView.delete({ where: { id: view.id } });
}

export async function duplicateView({
  viewId,
  name,
  user,
  module,
}: {
  viewId: string;
  name?: string | null;
  user: ViewUser;
  module?: string | null;
}) {
  const view =
    (await getViewById(viewId)) || (module ? await getView(module, viewId) : null);
  if (!view) throw new Response("View not found", { status: 404 });
  assertViewModule(view, module);
  const nextName =
    name && name.trim() ? name.trim() : `${view.name} (copy)`;
  return prisma.savedView.create({
    data: {
      module: view.module,
      name: nextName,
      params: view.params as any,
      ownerUserId: user.id,
      isGlobal: false,
      isLocked: false,
      createdBy: String(user.id),
      modifiedBy: String(user.id),
    },
  });
}

export async function publishView({
  viewId,
  user,
  module,
}: {
  viewId: string;
  user: ViewUser;
  module?: string | null;
}) {
  if (!user.isAdmin) throw new Response("Admin required", { status: 403 });
  const view =
    (await getViewById(viewId)) || (module ? await getView(module, viewId) : null);
  if (!view) throw new Response("View not found", { status: 404 });
  assertViewModule(view, module);
  return prisma.savedView.update({
    where: { id: view.id },
    data: {
      isGlobal: true,
      ownerUserId: null,
      modifiedBy: String(user.id),
    },
  });
}

export async function unpublishView({
  viewId,
  user,
  module,
}: {
  viewId: string;
  user: ViewUser;
  module?: string | null;
}) {
  if (!user.isAdmin) throw new Response("Admin required", { status: 403 });
  const view =
    (await getViewById(viewId)) || (module ? await getView(module, viewId) : null);
  if (!view) throw new Response("View not found", { status: 404 });
  assertViewModule(view, module);
  return prisma.savedView.update({
    where: { id: view.id },
    data: {
      isGlobal: false,
      ownerUserId: user.id,
      modifiedBy: String(user.id),
    },
  });
}
