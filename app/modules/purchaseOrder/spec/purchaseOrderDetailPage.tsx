import type { PageNode } from "~/base/forms/layoutTypes";
import { L } from "~/base/forms/layoutDsl";
import { purchaseOrderMainFields } from "~/modules/purchaseOrder/forms/purchaseOrderDetail";

const isDraft = ({ ctx }: { ctx?: any }) => Boolean(ctx?.isLoudMode);
const surfaceUiMode = ({ ctx }: { ctx?: any }) =>
  ctx?.isLoudMode ? "normal" : "quiet";
const surfaceAllowEdit = ({ ctx }: { ctx?: any }) => Boolean(ctx?.isLoudMode);

export const purchaseOrderDetailPage: PageNode = L.page(
  { gutter: "md" },
  L.col(
    { span: { base: 12 } },
    L.card(
      {
        key: "overview",
        title: "Purchase Order",
        drawerTitle: "Edit purchase order",
        drawerItems: purchaseOrderMainFields,
        editableInlineWhen: isDraft,
        surfaceUiMode,
        surfaceAllowEdit,
        drawerUiMode: "normal",
        drawerAllowEdit: true,
      },
      ...purchaseOrderMainFields
    )
  )
);
