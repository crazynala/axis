import type { PageNode } from "~/base/forms/layoutTypes";
import { L } from "~/base/forms/layoutDsl";
import {
  boxDetailContextFields,
  boxDetailIdentityFields,
} from "~/modules/box/forms/boxDetail";

const surfaceUiMode = ({ ctx }: { ctx?: any }) =>
  ctx?.isShipped ? "quiet" : "normal";
const surfaceAllowEdit = ({ ctx }: { ctx?: any }) => !ctx?.isShipped;

export const boxDetailPage: PageNode = L.page(
  { gutter: "md" },
  L.col(
    { span: { base: 12, md: 6 } },
    L.card(
      {
        key: "identity",
        drawerTitle: "Edit box details",
        drawerItems: boxDetailIdentityFields,
        editableInlineWhen: ({ ctx }) => !ctx?.isShipped,
        surfaceUiMode,
        surfaceAllowEdit,
        drawerUiMode: "normal",
        drawerAllowEdit: true,
      },
      ...boxDetailIdentityFields
    ),
  ),
  L.col(
    { span: { base: 12, md: 6 } },
    L.card(
      {
        key: "context",
        drawerTitle: "Edit box context",
        drawerItems: boxDetailContextFields,
        editableInlineWhen: ({ ctx }) => !ctx?.isShipped,
        surfaceUiMode,
        surfaceAllowEdit,
        drawerUiMode: "normal",
        drawerAllowEdit: true,
      },
      ...boxDetailContextFields
    )
  )
);
