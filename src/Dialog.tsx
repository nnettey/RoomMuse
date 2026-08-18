import React, { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { C } from "./theme";

// Why this file exists.
//
// `Alert.alert` from react-native is a genuine dialog on device but on react-native-web it is
// literally `class Alert { static alert() {} }` — an empty function. Every confirmation, every
// explanation and every error this app raised was therefore INVISIBLE in a browser, which is how the
// user actually tested it (Chrome on iPhone). That single fact produced three separate "this button
// does nothing" findings (F3 camera, F4/F5 share) and silently disabled "Mark complete" and
// "Delete project" in the project library.
//
// So the app owns its dialog. One implementation, identical on device and in a browser, locatable by
// accessible name so the journeys can drive it.

export type DialogTone = "default" | "cancel" | "destructive";
export type DialogAction = { label: string; value: string; tone?: DialogTone };

type DialogRequest = {
  title: string;
  message?: string;
  // Long text the user needs to be able to read, select and copy. Used by the share fallback when the
  // platform offers neither a share sheet nor a clipboard — on an insecure origin, for instance,
  // where `navigator.share` and `navigator.clipboard` are both undefined.
  copyable?: string;
  actions: DialogAction[];
  resolve: (value: string) => void;
};

// A queue rather than a single slot: dialogs can be raised from async code that does not know
// whether one is already open, and dropping the second would lose a user decision.
const queue: DialogRequest[] = [];
let listener: (request: DialogRequest | undefined) => void = () => {};

function pump() {
  listener(queue[0]);
}

function present(request: Omit<DialogRequest, "resolve">): Promise<string> {
  return new Promise<string>(resolve => {
    queue.push({ ...request, resolve });
    pump();
  });
}

function settle(value: string) {
  const request = queue.shift();
  pump();
  request?.resolve(value);
}

/** Tell the user something. Resolves when they dismiss it. */
export function showAlert(title: string, message?: string): Promise<string> {
  return present({ title, message, actions: [{ label: "OK", value: "ok" }] });
}

/** Ask the user to confirm. Resolves true only on the confirming action. */
export async function confirmAction(
  title: string,
  message: string,
  confirmLabel = "Continue",
  tone: DialogTone = "default",
  cancelLabel = "Cancel"
): Promise<boolean> {
  const value = await present({
    title,
    message,
    actions: [{ label: cancelLabel, value: "cancel", tone: "cancel" }, { label: confirmLabel, value: "confirm", tone }]
  });
  return value === "confirm";
}

/** Show text the user can select and copy. The last-resort share path. */
export function showCopyableText(title: string, message: string, copyable: string): Promise<string> {
  return present({ title, message, copyable, actions: [{ label: "Done", value: "ok" }] });
}

/** Mount exactly once, at the app root. */
export function AppDialog() {
  const [request, setRequest] = useState<DialogRequest | undefined>(undefined);
  useEffect(() => {
    listener = setRequest;
    // Replay anything raised before this mounted.
    pump();
    return () => {
      listener = () => {};
    };
  }, []);
  const open = Boolean(request);
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => settle("cancel")}>
      <View style={s.scrim}>
        <View style={s.card} accessibilityViewIsModal accessibilityRole="alert" accessibilityLabel={request?.title}>
          {request ? (
            <>
              <Text style={s.title}>{request.title}</Text>
              {request.message ? <Text style={s.message}>{request.message}</Text> : null}
              {request.copyable ? (
                <ScrollView style={s.copyBox} contentContainerStyle={s.copyInner}>
                  <TextInput
                    style={s.copyText}
                    value={request.copyable}
                    multiline
                    editable={false}
                    selectTextOnFocus
                    accessibilityLabel="Shareable summary"
                  />
                </ScrollView>
              ) : null}
              <View style={s.actions}>
                {request.actions.map(action => (
                  <Pressable
                    key={action.value}
                    accessibilityRole="button"
                    accessibilityLabel={action.label}
                    style={({ pressed }) => [s.action, action.tone === "cancel" && s.actionQuiet, pressed && s.actionPressed]}
                    onPress={() => settle(action.value)}
                  >
                    <Text style={[s.actionText, action.tone === "cancel" && s.actionQuietText, action.tone === "destructive" && s.actionDestructiveText]}>
                      {action.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: "rgba(23,33,27,.45)", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 420, borderRadius: 18, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 20 },
  title: { fontSize: 18, fontWeight: "700", color: C.ink },
  message: { marginTop: 8, fontSize: 15, lineHeight: 21, color: C.muted },
  copyBox: { marginTop: 14, maxHeight: 190, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.white },
  copyInner: { padding: 12 },
  copyText: { fontSize: 13, lineHeight: 19, color: C.ink, minHeight: 120 },
  actions: { marginTop: 18, flexDirection: "row", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" },
  action: { minHeight: 44, minWidth: 88, paddingHorizontal: 18, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: C.green },
  actionQuiet: { backgroundColor: "transparent", borderWidth: 1, borderColor: C.line },
  actionPressed: { opacity: .82 },
  actionText: { fontSize: 15, fontWeight: "700", color: C.white },
  actionQuietText: { color: C.ink },
  actionDestructiveText: { color: C.white }
});
