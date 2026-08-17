// WS-5a screens: numeric budget, the saved-project library, and price refresh.
//
// These render what the domain computes. No money maths, no policy — budgetSummary,
// priceMovement and the project store own those, so every surface agrees.
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { budgetSummary, suggestSubstitutions, closesGap } from "./budget";
import { priceMovement, projectStatus, selected } from "./domain";
import type { ProjectSummary } from "./projectStore";
import type { Budget, Item, Project } from "./enhancedTypes";

const C = { ink: "#17211B", green: "#244C3B", paper: "#FCFBF7", line: "#DEDCD3", clay: "#B87958", muted: "#68706A", white: "#FFF", warn: "#963C33", good: "#2F6B4F" };
const money = (n: number) => "$" + Math.round(n).toLocaleString();
const signed = (n: number) => (n >= 0 ? "+" : "−") + money(Math.abs(n));

const Btn = ({ label, onPress, quiet = false, disabled = false }: { label: string; onPress: () => void; quiet?: boolean; disabled?: boolean }) => (
  <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[s.btn, quiet && s.quiet, disabled && s.disabled]}>
    <Text style={[s.btnText, quiet && { color: C.green }]}>{label}</Text>
  </Pressable>
);
const Top = ({ title, back, action }: { title: string; back: () => void; action?: React.ReactNode }) => (
  <View style={s.top}>
    <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={back} style={s.touch}><Text style={s.back}>‹</Text></Pressable>
    <Text style={s.topTitle}>{title}</Text>
    <View style={s.touch}>{action}</View>
  </View>
);

// ── Budget (REQ-2) ───────────────────────────────────────────────────────────

export function BudgetSetupScreen({ project, onBack, onSave, onContinue }: { project: Project; onBack: () => void; onSave: (p: Project) => void; onContinue: (p: Project) => void }) {
  const concept = selected(project);
  const items = concept?.shoppingItems ?? [];
  const [draft, setDraft] = useState(project.budget ? String(Math.round(project.budget.total)) : "");
  const parsed = Number(draft.replace(/[^0-9.]/g, ""));
  const budget: Budget | undefined = parsed > 0 ? { total: parsed, currency: "USD", setAt: new Date().toISOString() } : undefined;
  const summary = budgetSummary(items, budget);
  const protectedIds = items.filter(i => i.constraintId).map(i => i.id);
  const swaps = suggestSubstitutions(items, budget, protectedIds);
  const enough = closesGap(items, budget, swaps);

  const apply = () => {
    if (!budget) return;
    // Hand the updated project straight to the next step. Saving is debounced, so relying on state
    // having settled would send the plan request without the budget the user just entered.
    const next = { ...project, budget, updatedAt: new Date().toISOString() };
    onSave(next);
    onContinue(next);
  };

  return (
    <SafeAreaView style={s.page}>
      <Top title="Project budget" back={onBack} />
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.h1}>What would you like to spend?</Text>
        <Text style={s.body}>RoomMuse works within this figure when it looks for products, rather than totalling things up afterwards.</Text>
        <TextInput accessibilityLabel="Project budget in dollars" value={draft} onChangeText={setDraft} keyboardType="number-pad" placeholder="e.g. 6000" placeholderTextColor="#9AA29C" style={s.amount} />

        {items.length > 0 && (
          <View style={[s.card, summary.overBudget && s.cardWarn]}>
            <Row label="Projected spend" value={money(summary.projectedSpend)} />
            <Row label="Still to purchase" value={money(summary.remainingToPurchase)} />
            {budget && <Row label={summary.overBudget ? "Over budget by" : "Remaining budget"} value={money(Math.abs(summary.variance))} tone={summary.overBudget ? "warn" : "good"} />}
            {!budget && <Text style={s.note}>Enter a figure to see how this plan compares.</Text>}
          </View>
        )}

        {summary.byCategory.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Where the money goes</Text>
            {summary.byCategory.map(line => (
              <View key={line.category} style={s.catRow}>
                <Text style={s.catName}>{line.category}</Text>
                <View style={s.barTrack}><View style={[s.barFill, { width: `${Math.round(line.share * 100)}%` }]} /></View>
                <Text style={s.catValue}>{money(line.projected)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* REQ-2: when a design exceeds budget, explain the drivers and offer real substitutions. */}
        {summary.overBudget && (
          <View style={[s.card, s.cardWarn]}>
            <Text style={s.cardTitle}>What is driving the cost</Text>
            {summary.costDrivers.slice(0, 3).map(driver => (
              <View key={driver.itemId} style={s.driver}>
                <Text style={s.driverName}>{driver.name}</Text>
                <Text style={s.driverMeta}>{money(driver.amount)} · {Math.round(driver.share * 100)}% of the plan</Text>
                {driver.suggestion && <Text style={s.body}>{driver.suggestion}</Text>}
              </View>
            ))}
            {swaps.length > 0 ? (
              <Text style={s.body}>
                {swaps.length} substitution{swaps.length > 1 ? "s" : ""} would save about {money(swaps.reduce((sum, x) => sum + x.saving, 0))} while keeping the design intact.
                {!enough && " That still leaves you over — you may want to raise the budget or drop a piece."}
              </Text>
            ) : (
              <Text style={s.body}>No verified cheaper alternatives are available for these pieces, so the honest options are to raise the budget or remove something.</Text>
            )}
          </View>
        )}

        <Btn label={budget ? "Save budget and continue" : "Enter a budget to continue"} disabled={!budget} onPress={apply} />
        <Btn label="Skip for now" quiet onPress={() => onContinue(project)} />
      </ScrollView>
    </SafeAreaView>
  );
}

const Row = ({ label, value, tone }: { label: string; value: string; tone?: "warn" | "good" }) => (
  <View style={s.row}>
    <Text style={s.rowLabel}>{label}</Text>
    <Text style={[s.rowValue, tone === "warn" && { color: C.warn }, tone === "good" && { color: C.good }]}>{value}</Text>
  </View>
);

// ── Saved projects (REQ-6, REQ-7) ────────────────────────────────────────────

export function ProjectLibraryScreen({ summaries, busy, onBack, onOpen, onDelete, onSetStatus, onNew }: {
  summaries: ProjectSummary[]; busy: boolean; onBack: () => void;
  onOpen: (id: string) => void; onDelete: (id: string) => void; onSetStatus: (id: string, status: "in-progress" | "complete") => void; onNew: () => void;
}) {
  return (
    <SafeAreaView style={s.page}>
      <Top title="Your projects" back={onBack} />
      <ScrollView contentContainerStyle={s.content}>
        {busy && <ActivityIndicator color={C.green} />}
        {!busy && summaries.length === 0 && <Text style={s.body}>No saved projects yet. Scan a room to start one.</Text>}
        {summaries.map(summary => (
          <View key={summary.projectId} style={s.card}>
            <View style={s.projectRow}>
              {summary.thumbnailUri ? <Image source={{ uri: summary.thumbnailUri }} style={s.projectThumb} /> : <View style={s.projectThumb} />}
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>{summary.title}</Text>
                <Text style={s.badgeRow}>
                  <Text style={summary.status === "complete" ? s.badgeDone : s.badgeLive}>{summary.status === "complete" ? "  Complete  " : "  In progress  "}</Text>
                </Text>
                <Text style={s.body}>{summary.itemCount} pieces · {money(summary.planTotal)} · {money(summary.remainingToPurchase)} still to buy</Text>
                <Text style={s.note}>Updated {new Date(summary.updatedAt).toLocaleDateString()}{summary.completedAt ? ` · completed ${new Date(summary.completedAt).toLocaleDateString()}` : ""}</Text>
              </View>
            </View>
            <Btn label={"Open " + summary.title} onPress={() => onOpen(summary.projectId)} />
            <Btn
              quiet
              label={summary.status === "complete" ? "Reopen this project" : "Mark complete"}
              onPress={() => {
                if (summary.status === "complete") return onSetStatus(summary.projectId, "in-progress");
                // Completing freezes prices, so say so before doing it rather than after.
                Alert.alert("Mark this project complete?", "Its prices will be kept as a record of what you paid and will not be refreshed again. You can reopen it later.",
                  [{ text: "Not yet", style: "cancel" }, { text: "Mark complete", onPress: () => onSetStatus(summary.projectId, "complete") }]);
              }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={"Delete " + summary.title}
              onPress={() => Alert.alert("Delete this project?", "It will be removed from this device. This cannot be undone.",
                [{ text: "Keep it", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => onDelete(summary.projectId) }])}
              style={s.delete}
            >
              <Text style={s.deleteText}>Delete</Text>
            </Pressable>
          </View>
        ))}
        <Btn label="Scan a new room" quiet onPress={onNew} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Price refresh (REQ-7) ────────────────────────────────────────────────────

export function PriceRefreshScreen({ project, busy, error, lastRefreshedAt, failures, onBack, onRefresh }: {
  project: Project; busy: boolean; error?: string; lastRefreshedAt?: string; failures: { itemId: string; reason: string }[];
  onBack: () => void; onRefresh: () => void;
}) {
  const concept = selected(project);
  const items = (concept?.shoppingItems ?? []).filter(i => !i.isRemoved);
  const movements = items.map(priceMovement).filter(m => m.previous && m.changeAmount !== 0);
  const totalEffect = movements.reduce((sum, m) => sum + m.totalEffect, 0);
  const complete = projectStatus(project) === "complete";
  const byId = new Map(items.map(i => [i.id, i] as const));

  return (
    <SafeAreaView style={s.page}>
      <Top title="Price check" back={onBack} />
      <ScrollView contentContainerStyle={s.content}>
        {complete ? (
          // REQ-7: a completed project is a historical snapshot. Do not even offer a refresh.
          <View style={s.card}>
            <Text style={s.cardTitle}>This project is complete</Text>
            <Text style={s.body}>Its prices are kept as a record of what you paid and are not refreshed. Reopen it from your projects list if you want to start checking again.</Text>
            {project.completionSnapshot && <Row label="Total at completion" value={money(project.completionSnapshot.projectTotal)} />}
          </View>
        ) : (
          <>
            <Text style={s.h1}>Check for changes</Text>
            <Text style={s.body}>RoomMuse re-checks each product on the same retailer page it linked to. Prices that cannot be confirmed are reported rather than guessed.</Text>
            {lastRefreshedAt && <Text style={s.note}>Last checked {new Date(lastRefreshedAt).toLocaleString()}</Text>}
            <Btn label={busy ? "Checking prices…" : "Check prices now"} disabled={busy} onPress={onRefresh} />
            {busy && <ActivityIndicator color={C.green} style={{ marginVertical: 12 }} />}
            {error && <View style={[s.card, s.cardWarn]}><Text style={s.cardTitle}>The check did not finish</Text><Text style={s.body}>{error}</Text></View>}
          </>
        )}

        {movements.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>What changed</Text>
            {movements.map(movement => (
              <View key={movement.itemId} style={s.driver}>
                <Text style={s.driverName}>{movement.name}</Text>
                <Text style={s.driverMeta}>
                  {money(movement.previous!.price)} on {new Date(movement.previous!.observedAt).toLocaleDateString()}
                  {"  →  "}
                  {money(movement.current!.price)} on {new Date(movement.current!.observedAt).toLocaleDateString()}
                </Text>
                <Text style={[s.change, movement.changeAmount > 0 ? { color: C.warn } : { color: C.good }]}>
                  {signed(movement.changeAmount)} ({Math.abs(Math.round(movement.changePercent * 100))}%)
                  {movement.quantity > 1 ? `  ·  ${signed(movement.totalEffect)} on the total` : ""}
                </Text>
                {byId.get(movement.itemId)?.availability && <Text style={s.note}>{byId.get(movement.itemId)!.availability}</Text>}
              </View>
            ))}
            <Row label="Effect on project total" value={signed(totalEffect)} tone={totalEffect > 0 ? "warn" : "good"} />
          </View>
        )}

        {failures.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Could not be confirmed</Text>
            <Text style={s.body}>These keep their last known price rather than an estimated one.</Text>
            {failures.map(failure => (
              <Text key={failure.itemId} style={s.note}>• {byId.get(failure.itemId)?.name ?? failure.itemId} — {failure.reason}</Text>
            ))}
          </View>
        )}

        {!complete && movements.length === 0 && failures.length === 0 && !busy && lastRefreshedAt && (
          <View style={s.card}><Text style={s.body}>No price changes since the last check.</Text></View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.paper },
  top: { height: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12 },
  touch: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  back: { fontSize: 34, color: C.green, lineHeight: 38 },
  topTitle: { fontWeight: "800", color: C.ink },
  content: { padding: 20, paddingBottom: 80 },
  h1: { fontFamily: "Georgia", fontSize: 30, lineHeight: 37, color: C.ink, marginVertical: 8 },
  body: { fontSize: 14, lineHeight: 21, color: C.muted, marginTop: 4 },
  note: { fontSize: 11, lineHeight: 17, color: C.muted, marginTop: 6 },
  amount: { minHeight: 62, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingHorizontal: 16, fontSize: 26, fontFamily: "Georgia", color: C.ink, backgroundColor: C.white, marginVertical: 14 },
  card: { padding: 17, borderRadius: 18, borderWidth: 1, borderColor: C.line, marginVertical: 8, backgroundColor: C.white },
  cardWarn: { borderColor: "#E7BDB7", backgroundColor: "#F8E8E5" },
  cardTitle: { fontSize: 16, fontWeight: "800", color: C.ink, marginBottom: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 7, borderTopWidth: 1, borderTopColor: C.line },
  rowLabel: { fontSize: 13, color: C.muted, flexShrink: 1 },
  rowValue: { fontSize: 17, fontWeight: "800", color: C.ink, marginLeft: 10 },
  catRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 5 },
  catName: { fontSize: 12, color: C.ink, width: 104 },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: "#EDEAE1", overflow: "hidden" },
  barFill: { height: 8, borderRadius: 4, backgroundColor: C.green },
  catValue: { fontSize: 12, fontWeight: "700", color: C.ink, width: 66, textAlign: "right" },
  driver: { paddingVertical: 9, borderTopWidth: 1, borderTopColor: C.line },
  driverName: { fontSize: 14, fontWeight: "700", color: C.ink },
  driverMeta: { fontSize: 12, color: C.muted, marginTop: 3 },
  change: { fontSize: 13, fontWeight: "800", marginTop: 4 },
  btn: { minHeight: 54, borderRadius: 17, backgroundColor: C.green, alignItems: "center", justifyContent: "center", marginVertical: 5, padding: 10 },
  quiet: { backgroundColor: C.paper, borderWidth: 1, borderColor: C.line },
  disabled: { opacity: 0.45 },
  btnText: { fontSize: 15, fontWeight: "800", color: C.white },
  projectRow: { flexDirection: "row", gap: 12, marginBottom: 10 },
  projectThumb: { width: 86, height: 86, borderRadius: 14, backgroundColor: "#E8E6DD" },
  badgeRow: { marginVertical: 5 },
  badgeLive: { fontSize: 10, fontWeight: "800", color: C.green, backgroundColor: "#E8EFE8", borderRadius: 8, overflow: "hidden" },
  badgeDone: { fontSize: 10, fontWeight: "800", color: C.white, backgroundColor: C.green, borderRadius: 8, overflow: "hidden" },
  delete: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: 2 },
  deleteText: { fontSize: 13, fontWeight: "700", color: C.warn }
});
