import { notifications, type NotificationData } from "@mantine/notifications";

type ToastInput = string | NotificationData;

const baseShow = (input: ToastInput, defaults: NotificationData) => {
  if (typeof input === "string") {
    notifications.show({ ...defaults, message: input });
  } else {
    notifications.show({ ...defaults, ...input });
  }
};

export function showToastError(input: ToastInput) {
  baseShow(input, { color: "red", title: "Error" });
}

export function showToastSuccess(input: ToastInput) {
  baseShow(input, { color: "green", title: "Success" });
}

