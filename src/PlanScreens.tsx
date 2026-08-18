// WS-5a screens: numeric budget, the saved-project library, and price refresh.
//
// These render what the domain computes. No money maths, no policy — budgetSummary,
// priceMovement and the project store own those, so every surface agrees.
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { confirmAction } from "./Dialog";
import { SafeAreaView } from "react-native-safe-area-context";
import { budgetSummary, suggestSubstitutions, closesGap } from "./budget";
import { applyBudget, priceMovement, projectStatus, replace, selected, swapItem, updateItem } from "./domain";
import { canModifyItem } from "./constraints";
import { showAlert } from "./Dialog";
import type { ProjectSummary } from "./projectStore";
import type { Budget, BudgetTier, CostDriver, Item, Project } from "./enhancedTypes";

import{C}from"./theme";
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

export function BudgetSetupScreen({ project, onBack, onSave, onContinue, continueLabel, onRebuild }: { project: Project; onBack: () => void; onSave: (p: Project) => void; onContinue: (p: Project) => void; continueLabel?: string; onRebuild?: (p: Project) => void }) {
  const concept = selected(project);
  const items = concept?.shoppingItems ?? [];
  const [draft, setDraft] = useState(project.budget ? String(Math.round(project.budget.total)) : "");
  const parsed = Number(draft.replace(/[^0-9.]/g, ""));
  const budget: Budget | undefined = parsed > 0 ? { total: parsed, currency: "USD", setAt: new Date().toISOString() } : undefined;
  const summary = budgetSummary(items, budget);
  const protectedIds = items.filter(i => i.constraintId).map(i => i.id);
  const swaps = suggestSubstitutions(items, budget, protectedIds);
  const enough = closesGap(items, budget, swaps);
  const byId = new Map(items.map(i => [i.id, i]));
  const removed = items.filter(i => i.isRemoved);
  const swapFor = new Map(swaps.map(x => [x.itemId, x]));

  const withBudget = (p: Project) => (budget ? { ...p, budget, updatedAt: new Date().toISOString() } : p);

  // Every edit goes through the domain: updateItem/swapItem for the change, canModifyItem for the
  // keep-this guard, so a constraint cannot be quietly undone to hit a number (REQ-10).
  const change = (item: Item, changes: Partial<Item>) => {
    if (!concept) return;
    const verdict = canModifyItem(project, item, changes);
    if (!verdict.allowed) { void showAlert("This piece is protected", verdict.reason ?? "You asked to keep this, so it cannot be changed here."); return; }
    onSave(withBudget(replace(project, updateItem(concept, item.id, changes))));
  };
  const takeSwap = (item: Item) => {
    if (!concept) return;
    const alternative = (item.alternatives ?? []).find(a => a.purchaseUrl === swapFor.get(item.id)?.purchaseUrl);
    if (!alternative) return;
    const verdict = canModifyItem(project, item, { unitPrice: alternative.unitPrice });
    if (!verdict.allowed) { void showAlert("This piece is protected", verdict.reason ?? "You asked to keep this, so it cannot be swapped."); return; }
    onSave(withBudget(replace(project, swapItem(concept, item.id, alternative))));
  };

  const apply = () => {
    if (!budget) return;
    // Hand the updated project straight to the next step. Saving is debounced, so relying on state
    // having settled would send the plan request without the budget the user just entered.
    const next = { ...project, budget, updatedAt: new Date().toISOString() };
    onSave(next);
    onContinue(next);
  };

  // F10: the cost drivers were static text. Each one is now something the user can act on.
  const driverRow = (driver: CostDriver) => {
    const item = byId.get(driver.itemId);
    if (!item) return null;
    const locked = Boolean(item.constraintId);
    const swap = swapFor.get(item.id);
    return (
      <View key={driver.itemId} style={s.driver}>
        <Text style={s.driverName}>{driver.name}</Text>
        <Text style={s.driverMeta}>{money(driver.amount)} · {Math.round(driver.share * 100)}% of the plan</Text>
        {locked ? (
          <Text style={s.note}>You asked to keep this piece, so it is left alone.</Text>
        ) : (
          <View style={s.driverActions}>
            <View style={s.stepper}>
              <Pressable accessibilityRole="button" accessibilityLabel={"Reduce quantity of " + item.name} disabled={item.quantity <= 1} onPress={() => change(item, { quantity: Math.max(1, item.quantity - 1) })} style={[s.step, item.quantity <= 1 && s.disabled]}><Text style={s.stepText}>−</Text></Pressable>
              <Text style={s.stepCount} accessibilityLabel={item.name + " quantity"}>{item.quantity}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={"Increase quantity of " + item.name} onPress={() => change(item, { quantity: item.quantity + 1 })} style={s.step}><Text style={s.stepText}>+</Text></Pressable>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={"Remove " + item.name} onPress={() => change(item, { isRemoved: true })} style={s.driverAction}><Text style={s.driverActionText}>Remove</Text></Pressable>
            {swap && <Pressable accessibilityRole="button" accessibilityLabel={"Swap " + item.name + " to " + swap.to} onPress={() => takeSwap(item)} style={s.driverAction}><Text style={s.driverActionText}>Save {money(swap.saving)}</Text></Pressable>}
          </View>
        )}
        {swap && !locked && <Text style={s.note}>{swap.to} at {swap.retailer}, {money(swap.newUnitPrice)} — verified on the retailer's product page.</Text>}
      </View>
    );
  };

  const tiers: { id: BudgetTier; label: string; hint: string }[] = [
    { id: "save", label: "Save", hint: "cheapest verified option" },
    { id: "balanced", label: "Balanced", hint: "middle of the range" },
    { id: "invest", label: "Invest", hint: "best of the verified options" }
  ];

  return (
    <SafeAreaView style={s.page}>
      <Top title="Project budget" back={onBack} />
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.h1}>What would you like to spend?</Text>
        <Text style={s.body}>Tracy’s Room Muse works within this figure when it looks for products, rather than totalling things up afterwards. The numbers below update as you type.</Text>
        {/* F11: number-pad has no return key, so the only way out of the keyboard was the key that
            hides it. A visible Done sits beside the field — the one affordance that works on a
            phone browser as well as on the device keyboard. */}
        <View style={s.amountRow}>
          <TextInput
            accessibilityLabel="Project budget in dollars"
            value={draft}
            onChangeText={setDraft}
            keyboardType="number-pad"
            inputMode="numeric"
            returnKeyType="done"
            onSubmitEditing={() => { if (budget) onSave({ ...project, budget, updatedAt: new Date().toISOString() }); }}
            placeholder="e.g. 6000"
            placeholderTextColor="#9AA29C"
            style={[s.amount, s.amountField]}
          />
          <Pressable accessibilityRole="button" accessibilityLabel="Done entering budget" onPress={() => { if (budget) onSave({ ...project, budget, updatedAt: new Date().toISOString() }); }} style={s.done}><Text style={s.doneText}>Done</Text></Pressable>
        </View>

        {items.length > 0 && (
          <View style={[s.card, summary.overBudget && s.cardWarn]}>
            <Row label="Projected spend" value={money(summary.projectedSpend)} />
            <Row label="Still to purchase" value={money(summary.remainingToPurchase)} />
            {budget && <Row label={summary.overBudget ? "Over budget by" : "Remaining budget"} value={money(Math.abs(summary.variance))} tone={summary.overBudget ? "warn" : "good"} />}
            {!budget && <Text style={s.note}>Enter a figure to see how this plan compares.</Text>}
          </View>
        )}

        {items.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>How hard should we look for savings?</Text>
            <View style={s.tierRow}>
              {tiers.map(tier => (
                <Pressable key={tier.id} accessibilityRole="button" accessibilityLabel={"Savings strategy: " + tier.label} accessibilityState={{ selected: project.budgetTier === tier.id }} onPress={() => onSave(withBudget(applyBudget(project, tier.id)))} style={[s.tier, project.budgetTier === tier.id && s.tierOn]}>
                  <Text style={[s.tierLabel, project.budgetTier === tier.id && s.tierLabelOn]}>{tier.label}</Text>
                  <Text style={[s.tierHint, project.budgetTier === tier.id && s.tierLabelOn]}>{tier.hint}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={s.note}>This only ever moves a piece to another verified product on a retailer's own product page. Pieces you asked to keep are never touched.</Text>
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

        {/* REQ-2 / F10: the drivers are shown whether or not the plan is over budget, because the
            user wants to shape the spend either way — not only when the app complains. */}
        {summary.costDrivers.length > 0 && (
          <View style={[s.card, summary.overBudget && s.cardWarn]}>
            <Text style={s.cardTitle}>What is driving the cost</Text>
            {summary.costDrivers.slice(0, 4).map(driverRow)}
            {summary.overBudget && (swaps.length > 0 ? (
              <Text style={s.body}>
                {swaps.length} substitution{swaps.length > 1 ? "s" : ""} would save about {money(swaps.reduce((sum, x) => sum + x.saving, 0))} while keeping the design intact.
                {!enough && " That still leaves you over — you may want to raise the budget or drop a piece."}
              </Text>
            ) : (
              <Text style={s.body}>No verified cheaper alternatives are available for these pieces, so the honest options are to raise the budget or remove something.</Text>
            ))}
          </View>
        )}

        {removed.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Removed from the plan</Text>
            {removed.map(item => (
              <View key={item.id} style={s.driver}>
                <Text style={s.driverName}>{item.name}</Text>
                <Text style={s.driverMeta}>{money(item.unitPrice * Math.max(0, item.quantity))} · not counted in the figures above</Text>
                <View style={s.driverActions}>
                  <Pressable accessibilityRole="button" accessibilityLabel={"Restore " + item.name} onPress={() => change(item, { isRemoved: false })} style={s.driverAction}><Text style={s.driverActionText}>Restore</Text></Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        <Btn label={budget ? (continueLabel ?? "Save budget and continue") : "Enter a budget to continue"} disabled={!budget} onPress={apply} />
        {onRebuild && <Btn label="Rebuild the plan for this budget" quiet disabled={!budget} onPress={() => { if (budget) { const next = { ...project, budget, updatedAt: new Date().toISOString() }; onSave(next); onRebuild(next); } }} />}
        {!onRebuild && <Btn label="Skip for now" quiet onPress={() => onContinue(project)} />}
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
                void confirmAction("Mark this project complete?", "Its prices will be kept as a record of what you paid and will not be refreshed again. You can reopen it later.", "Mark complete", "default", "Not yet")
                  .then(ok => { if (ok) onSetStatus(summary.projectId, "complete"); });
              }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={"Delete " + summary.title}
              onPress={() => { void confirmAction("Delete this project?", "It will be removed from this device. This cannot be undone.", "Delete", "destructive", "Keep it")
                .then(ok => { if (ok) onDelete(summary.projectId); }); }}
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
            <Text style={s.body}>Tracy’s Room Muse re-checks each product on the same retailer page it linked to. Prices that cannot be confirmed are reported rather than guessed.</Text>
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
  amountRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  amountField: { flex: 1 },
  done: { minHeight: 48, minWidth: 78, paddingHorizontal: 16, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: C.green },
  doneText: { color: C.white, fontSize: 15, fontWeight: "700" },
  driverActions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10, marginTop: 8 },
  driverAction: { minHeight: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" },
  driverActionText: { fontSize: 14, fontWeight: "700", color: C.green },
  stepper: { flexDirection: "row", alignItems: "center", gap: 4 },
  step: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" },
  stepText: { fontSize: 18, fontWeight: "700", color: C.ink },
  stepCount: { minWidth: 30, textAlign: "center", fontSize: 15, fontWeight: "700", color: C.ink },
  tierRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  tier: { flex: 1, minHeight: 62, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 10, justifyContent: "center" },
  tierOn: { borderColor: C.accent, borderWidth: 2 },
  tierLabel: { fontSize: 14, fontWeight: "700", color: C.ink },
  tierLabelOn: { color: C.ink },
  tierHint: { fontSize: 11, color: C.muted, marginTop: 2 },
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
