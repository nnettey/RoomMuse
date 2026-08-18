// WS-5b screens: design constraints, in-store substitution, favorites and comparison.
//
// As with PlanScreens, the rules live in domain/constraints/budget — these screens present them.
import React, { useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { confirmAction } from "./Dialog";
import * as ImagePicker from "expo-image-picker";
import { SafeAreaView } from "react-native-safe-area-context";
import { budgetSummary } from "./budget";
import { addFieldItem, compareConcepts, compareProducts, isFavorited, selected, substituteItem, total } from "./domain";
import { activeConstraints, addConstraint, createConstraint, releaseConstraint } from "./constraints";
import { identifyProduct, type IdentifyResult } from "./designService";
import type { ComparisonResult, ConstraintKind, Item, Project } from "./enhancedTypes";

const C = { ink: "#17211B", green: "#244C3B", paper: "#FCFBF7", line: "#DEDCD3", clay: "#B87958", muted: "#68706A", white: "#FFF", warn: "#963C33", good: "#2F6B4F" };
const money = (n: number) => "$" + Math.round(n).toLocaleString();

const Btn = ({ label, onPress, quiet = false, disabled = false }: { label: string; onPress: () => void; quiet?: boolean; disabled?: boolean }) => (
  <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[s.btn, quiet && s.quiet, disabled && s.disabled]}>
    <Text style={[s.btnText, quiet && { color: C.green }]}>{label}</Text>
  </Pressable>
);
const Top = ({ title, back }: { title: string; back: () => void }) => (
  <View style={s.top}>
    <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={back} style={s.touch}><Text style={s.back}>‹</Text></Pressable>
    <Text style={s.topTitle}>{title}</Text>
    <View style={s.touch} />
  </View>
);
async function pickPhoto() {
  const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.65, base64: true });
  const asset = result.canceled ? undefined : result.assets[0];
  return asset ? { uri: asset.uri, base64: asset.base64 ?? undefined } : undefined;
}

// ── Design constraints (REQ-10) ──────────────────────────────────────────────

const SUGGESTIONS: { kind: ConstraintKind; label: string }[] = [
  { kind: "keep-item", label: "Keep my existing sofa" },
  { kind: "keep-item", label: "Keep my existing dining table" },
  { kind: "keep-surface", label: "Do not change the flooring" },
  { kind: "no-change", label: "Do not repaint the walls" },
  { kind: "keep-feature", label: "Keep the fireplace as it is" },
  { kind: "keep-item", label: "Keep this artwork" }
];

export function ConstraintsScreen({ project, onBack, onSave }: { project: Project; onBack: () => void; onSave: (p: Project) => void }) {
  const [draft, setDraft] = useState("");
  const active = activeConstraints(project);
  const released = (project.constraints ?? []).filter(c => c.releasedAt);
  const concept = selected(project);
  const affected = (label: string) => (concept?.shoppingItems ?? []).filter(i => i.constraintId && (project.constraints ?? []).find(c => c.id === i.constraintId)?.label === label);

  const add = (kind: ConstraintKind, label: string) => {
    if (!label.trim()) return;
    onSave(addConstraint(project, createConstraint(kind, label)));
    setDraft("");
  };

  return (
    <SafeAreaView style={s.page}>
      <Top title="Things to keep" back={onBack} />
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.h1}>What should stay as it is?</Text>
        <Text style={s.body}>RoomMuse designs around these and will not propose replacing them. They are sent with every new plan, so they keep applying as the project changes.</Text>

        <TextInput accessibilityLabel="Describe something to keep" value={draft} onChangeText={setDraft} placeholder="For example: keep the bookcase by the window" placeholderTextColor="#9AA29C" style={s.input} />
        <Btn label="Add this constraint" disabled={!draft.trim()} onPress={() => add("keep-item", draft)} />

        <Text style={s.section}>COMMON ONES</Text>
        <View style={s.chips}>
          {SUGGESTIONS.filter(sug => !active.some(c => c.label === sug.label)).map(sug => (
            <Pressable key={sug.label} accessibilityRole="button" accessibilityLabel={"Add constraint: " + sug.label} onPress={() => add(sug.kind, sug.label)} style={s.chip}>
              <Text style={s.chipText}>+ {sug.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={s.section}>ACTIVE</Text>
        {active.length === 0 && <Text style={s.body}>Nothing is locked yet. Anything you add here is protected from swaps, removals and budget substitutions.</Text>}
        {active.map(constraint => {
          const items = affected(constraint.label);
          return (
            <View key={constraint.id} style={s.card}>
              <Text style={s.cardTitle}>{constraint.label}</Text>
              <Text style={s.note}>Added {new Date(constraint.createdAt).toLocaleDateString()}{items.length ? ` · protecting ${items.map(i => i.name).join(", ")}` : ""}</Text>
              {/* REQ-10: releasing must be deliberate, and the consequence stated before it happens. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={"Release constraint: " + constraint.label}
                onPress={() => { void confirmAction("Release this constraint?", `“${constraint.label}” will stop protecting your plan, and RoomMuse may suggest replacing it in future designs and budget changes.`, "Release", "destructive", "Keep it")
                  .then(ok => { if (ok) onSave(releaseConstraint(project, constraint.id)); }); }}
                style={s.release}
              >
                <Text style={s.releaseText}>Release</Text>
              </Pressable>
            </View>
          );
        })}

        {released.length > 0 && (
          <>
            <Text style={s.section}>RELEASED</Text>
            {released.map(constraint => (
              <Text key={constraint.id} style={s.note}>• {constraint.label} — released {new Date(constraint.releasedAt!).toLocaleDateString()}</Text>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── In-store substitution and addition (REQ-3) ───────────────────────────────

export function FieldScreen({ project, onBack, onSave }: { project: Project; onBack: () => void; onSave: (p: Project) => void }) {
  const concept = selected(project)!;
  const items = concept.shoppingItems.filter(i => !i.isRemoved);
  const [image, setImage] = useState<{ uri: string; base64?: string }>();
  const [notes, setNotes] = useState("");
  const [price, setPrice] = useState("");
  const [action, setAction] = useState<"replace" | "add">("replace");
  const [targetId, setTargetId] = useState<string | undefined>(items[0]?.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<IdentifyResult>();

  const target = items.find(i => i.id === targetId);
  const enteredPrice = Number(price.replace(/[^0-9.]/g, ""));
  const found = result ? { ...result.identified, name: result.suggestedName, price: Number.isFinite(enteredPrice) && enteredPrice > 0 ? enteredPrice : result.identified.price } : undefined;

  // Show the effect before anything is committed, so the decision is informed (REQ-3).
  const preview = useMemo(() => {
    if (!found) return undefined;
    const next = action === "replace" && targetId ? substituteItem(concept, targetId, found) : addFieldItem(concept, found);
    return { items: next.shoppingItems, summary: budgetSummary(next.shoppingItems, project.budget) };
  }, [found, action, targetId, concept, project.budget]);

  const check = async () => {
    if (!image?.base64) { setError("Choose a photo of the product first."); return; }
    setBusy(true); setError(undefined);
    try {
      setResult(await identifyProduct({
        imageBase64: image.base64, style: concept.style, action, userNotes: notes,
        userPrice: Number.isFinite(enteredPrice) && enteredPrice > 0 ? enteredPrice : undefined,
        roomAnalysis: concept.roomAnalysis, targetItem: action === "replace" && target ? { name: target.name, category: target.category, dimensions: target.dimensions, unitPrice: target.unitPrice } : undefined
      }));
    } catch (e) { setError(e instanceof Error ? e.message : "That product could not be checked."); }
    finally { setBusy(false); }
  };

  const apply = () => {
    if (!found || !preview) return;
    const revised = action === "replace" && targetId ? substituteItem(concept, targetId, found) : addFieldItem(concept, found);
    const find = {
      id: "find-" + Date.now(), image: image!, notes, verdict: "replace" as const, targetItemId: action === "replace" ? targetId : undefined,
      advice: result?.compatibility ?? "", createdAt: new Date().toISOString(),
      identified: result?.identified, action, replacedItemId: action === "replace" ? targetId : undefined, appliedAt: new Date().toISOString()
    };
    onSave({ ...project, fieldFinds: [find, ...project.fieldFinds], concepts: project.concepts.map(c => (c.id === concept.id ? revised : c)), updatedAt: new Date().toISOString() });
    setResult(undefined); setImage(undefined); setNotes(""); setPrice("");
    onBack();
  };

  return (
    <SafeAreaView style={s.page}>
      <Top title="Found in store" back={onBack} />
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.h1}>Use something you found</Text>
        <Text style={s.body}>Photograph it and RoomMuse will check it against {concept.title}, then show what it does to your plan before anything changes.</Text>

        {image && <Image source={{ uri: image.uri }} style={s.upload} />}
        <Btn label={image ? "Choose a different photo" : "Take or choose a product photo"} quiet onPress={async () => { const next = await pickPhoto(); if (next) { setImage(next); setResult(undefined); } }} />

        <Text style={s.section}>WHAT SHOULD IT DO?</Text>
        <View style={s.chips}>
          {(["replace", "add"] as const).map(mode => (
            <Pressable key={mode} accessibilityRole="radio" accessibilityState={{ selected: action === mode }} onPress={() => { setAction(mode); setResult(undefined); }} style={[s.chip, action === mode && s.chipOn]}>
              <Text style={[s.chipText, action === mode && { color: C.white }]}>{mode === "replace" ? "Replace a planned item" : "Add as a new item"}</Text>
            </Pressable>
          ))}
        </View>

        {action === "replace" && (
          <>
            <Text style={s.section}>WHICH ITEM IS IT REPLACING?</Text>
            {items.map(item => (
              <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ selected: targetId === item.id }} accessibilityLabel={"Replace " + item.name} onPress={() => { setTargetId(item.id); setResult(undefined); }} style={[s.pick, targetId === item.id && s.pickOn]}>
                <Text style={s.pickName}>{item.name}</Text>
                <Text style={s.note}>{item.category} · {money(item.unitPrice * item.quantity)}{item.constraintId ? " · protected by a constraint" : ""}</Text>
              </Pressable>
            ))}
          </>
        )}

        <Text style={s.section}>DETAILS</Text>
        <TextInput accessibilityLabel="Price on the tag" value={price} onChangeText={setPrice} keyboardType="number-pad" placeholder="Price on the tag (optional)" placeholderTextColor="#9AA29C" style={s.input} />
        <TextInput accessibilityLabel="Notes about this product" value={notes} onChangeText={setNotes} placeholder="Dimensions, material, store — anything on the label" placeholderTextColor="#9AA29C" style={s.input} />

        <Btn label={busy ? "Checking…" : "Check this product"} disabled={busy || !image} onPress={check} />
        {busy && <ActivityIndicator color={C.green} style={{ marginVertical: 10 }} />}
        {error && <View style={[s.card, s.cardWarn]}><Text style={s.cardTitle}>Could not check it</Text><Text style={s.body}>{error}</Text></View>}

        {result && found && (
          <View style={s.card}>
            <Text style={s.cardTitle}>{result.suggestedName}</Text>
            <Text style={s.note}>{result.identified.category} · identified with {result.confidence} confidence</Text>
            <Text style={s.body}>{result.compatibility}</Text>
            {result.designImplications?.map(line => <Text key={line} style={s.note}>• {line}</Text>)}
            {/* Never let an unknown size read as a measurement. */}
            <Text style={s.note}>
              {result.identified.dimensionsConfidence === "unknown"
                ? "Size could not be established from the photo — measure it in store before buying."
                : `Approximate size: ${result.identified.approximateDimensions} (${result.identified.dimensionsConfidence})`}
            </Text>
            <Text style={s.note}>{found.price ? `Price ${money(found.price)}, as entered by you — not verified with the retailer.` : "No price entered, so this piece will show without one."}</Text>

            {preview && (
              <View style={s.previewBox}>
                <Text style={s.cardTitle}>What this does to your plan</Text>
                <Row label="Plan total" value={money(total(preview.items))} />
                {project.budget && <Row label={preview.summary.overBudget ? "Over budget by" : "Remaining budget"} value={money(Math.abs(preview.summary.variance))} tone={preview.summary.overBudget ? "warn" : "good"} />}
                {action === "replace" && target && <Text style={s.note}>Replaces {target.name} ({money(target.unitPrice * target.quantity)}).</Text>}
              </View>
            )}
            <Btn label={action === "replace" ? "Use this instead" : "Add to my plan"} onPress={apply} />
          </View>
        )}

        {project.fieldFinds.length > 0 && <Text style={s.section}>EARLIER FINDS</Text>}
        {project.fieldFinds.map(find => (
          <View key={find.id} style={s.row}>
            <Image source={{ uri: find.image.uri }} style={s.thumb} />
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>{find.identified?.productType ?? find.notes ?? "Saved find"}</Text>
              <Text style={s.note}>{find.action === "add" ? "Added to the plan" : "Replaced a planned item"} · {new Date(find.createdAt).toLocaleDateString()}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const Row = ({ label, value, tone }: { label: string; value: string; tone?: "warn" | "good" }) => (
  <View style={s.summaryRow}>
    <Text style={s.rowLabel}>{label}</Text>
    <Text style={[s.rowValue, tone === "warn" && { color: C.warn }, tone === "good" && { color: C.good }]}>{value}</Text>
  </View>
);

// ── Favorites and comparison (REQ-9) ─────────────────────────────────────────

export function CompareScreen({ project, onBack, onToggleFavorite }: { project: Project; onBack: () => void; onToggleFavorite: (refId: string, kind: "product" | "concept", label: string) => void }) {
  const concept = selected(project);
  const items = (concept?.shoppingItems ?? []).filter(i => !i.isRemoved);
  const [mode, setMode] = useState<"product" | "concept">("product");
  const [picked, setPicked] = useState<string[]>([]);

  const toggle = (id: string) => setPicked(current => (current.includes(id) ? current.filter(x => x !== id) : [...current, id].slice(-3)));
  const comparison: ComparisonResult | undefined = useMemo(() => {
    if (picked.length < 2) return undefined;
    return mode === "product"
      ? compareProducts(picked.map(id => items.find(i => i.id === id)).filter((i): i is Item => Boolean(i)))
      : compareConcepts(project, picked);
  }, [picked, mode, items, project]);

  const choices = mode === "product" ? items.map(i => ({ id: i.id, label: i.name, sub: `${i.category} · ${money(i.unitPrice * i.quantity)}` })) : project.concepts.map(c => ({ id: c.id, label: c.conceptName, sub: `${c.shoppingItems.filter(i => !i.isRemoved).length} pieces · ${money(total(c.shoppingItems))}` }));

  return (
    <SafeAreaView style={s.page}>
      <Top title="Compare" back={onBack} />
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.chips}>
          {(["product", "concept"] as const).map(value => (
            <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: mode === value }} onPress={() => { setMode(value); setPicked([]); }} style={[s.chip, mode === value && s.chipOn]}>
              <Text style={[s.chipText, mode === value && { color: C.white }]}>{value === "product" ? "Products" : "Design variations"}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={s.body}>Pick two or three to compare side by side.</Text>

        {choices.map(choice => (
          <View key={choice.id} style={[s.pick, picked.includes(choice.id) && s.pickOn]}>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: picked.includes(choice.id) }} accessibilityLabel={"Compare " + choice.label} onPress={() => toggle(choice.id)} style={{ flex: 1 }}>
              <Text style={s.pickName}>{picked.includes(choice.id) ? "✓ " : ""}{choice.label}</Text>
              <Text style={s.note}>{choice.sub}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={(isFavorited(project, choice.id) ? "Remove " : "Save ") + choice.label + " from favorites"} onPress={() => onToggleFavorite(choice.id, mode, choice.label)} style={s.touch}>
              <Text style={{ fontSize: 20, color: isFavorited(project, choice.id) ? C.clay : "#C6CBC7" }}>{isFavorited(project, choice.id) ? "★" : "☆"}</Text>
            </Pressable>
          </View>
        ))}

        {comparison && (
          <View style={s.card}>
            <View style={s.compareHead}>
              <Text style={[s.compareCell, s.compareLabel]} />
              {comparison.refIds.map((id, index) => <Text key={id} style={[s.compareCell, s.compareHeadCell]}>{String(comparison.rows[0]?.values[index] ?? "")}</Text>)}
            </View>
            {comparison.rows.slice(1).map(row => (
              <View key={row.label} style={s.compareRow}>
                <Text style={[s.compareCell, s.compareLabel]}>{row.label}</Text>
                {row.values.map((value, index) => <Text key={index} style={s.compareCell}>{value === undefined ? "—" : String(value)}</Text>)}
              </View>
            ))}
            {comparison.tradeoffs.map(line => <Text key={line} style={s.tradeoff}>• {line}</Text>)}
          </View>
        )}

        {(project.favorites ?? []).length > 0 && (
          <>
            <Text style={s.section}>SAVED</Text>
            {(project.favorites ?? []).map(favorite => <Text key={favorite.id} style={s.note}>★ {favorite.label}</Text>)}
          </>
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
  note: { fontSize: 11, lineHeight: 17, color: C.muted, marginTop: 5 },
  section: { fontSize: 10, fontWeight: "800", letterSpacing: 1.3, color: C.muted, marginTop: 18, marginBottom: 6 },
  input: { minHeight: 52, borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingHorizontal: 13, fontSize: 14, color: C.ink, backgroundColor: C.white, marginVertical: 6 },
  card: { padding: 16, borderRadius: 18, borderWidth: 1, borderColor: C.line, marginVertical: 8, backgroundColor: C.white },
  cardWarn: { borderColor: "#E7BDB7", backgroundColor: "#F8E8E5" },
  cardTitle: { fontSize: 15, fontWeight: "800", color: C.ink, marginBottom: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginVertical: 6 },
  chip: { minHeight: 44, justifyContent: "center", paddingHorizontal: 13, borderRadius: 22, borderWidth: 1, borderColor: C.line, backgroundColor: C.white },
  chipOn: { backgroundColor: C.green, borderColor: C.green },
  chipText: { fontSize: 12, fontWeight: "700", color: C.green },
  pick: { flexDirection: "row", alignItems: "center", minHeight: 62, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.white, marginVertical: 4 },
  pickOn: { borderWidth: 2, borderColor: C.green },
  pickName: { fontSize: 14, fontWeight: "700", color: C.ink },
  release: { minHeight: 44, alignItems: "flex-start", justifyContent: "center" },
  releaseText: { fontSize: 13, fontWeight: "800", color: C.warn },
  upload: { height: 220, borderRadius: 18, marginVertical: 10, backgroundColor: "#E8E6DD" },
  previewBox: { marginTop: 12, padding: 13, borderRadius: 14, backgroundColor: "#E8EFE8" },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 5 },
  rowLabel: { fontSize: 13, color: C.muted },
  rowValue: { fontSize: 16, fontWeight: "800", color: C.ink },
  row: { flexDirection: "row", gap: 12, borderTopWidth: 1, borderTopColor: C.line, paddingVertical: 12 },
  thumb: { width: 74, height: 74, borderRadius: 12, backgroundColor: "#DDD" },
  compareHead: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.line, paddingBottom: 6 },
  compareRow: { flexDirection: "row", paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: "#F0EEE7" },
  compareCell: { flex: 1, fontSize: 11, lineHeight: 16, color: C.ink, paddingRight: 6 },
  compareLabel: { flex: 0.8, fontWeight: "700", color: C.muted },
  compareHeadCell: { fontWeight: "800" },
  tradeoff: { fontSize: 12, lineHeight: 18, color: C.green, marginTop: 8 },
  btn: { minHeight: 54, borderRadius: 17, backgroundColor: C.green, alignItems: "center", justifyContent: "center", marginVertical: 5, padding: 10 },
  quiet: { backgroundColor: C.paper, borderWidth: 1, borderColor: C.line },
  disabled: { opacity: 0.45 },
  btnText: { fontSize: 15, fontWeight: "800", color: C.white }
});
