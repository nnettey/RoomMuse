import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View, type ImageStyle } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { useKeepAwake } from "expo-keep-awake";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { styles as designStyles } from "./src/data";
import { createDesign } from "./src/designService";
import { DesignConcept, DesignStyle, Route } from "./src/types";

const C = { ink: "#17211B", forest: "#244C3B", sage: "#78917F", cream: "#F5F2EA", paper: "#FCFBF7", line: "#DEDCD3", clay: "#B87958", white: "#FFFFFF" };
type Photo = { uri: string; base64?: string };

async function preparePhoto(photo: Photo): Promise<Photo> {
  try {
    const result = await manipulateAsync(photo.uri, [{ resize: { width: 1600 } }], { compress: 0.72, format: SaveFormat.JPEG, base64: true });
    return { uri: result.uri, base64: result.base64 ?? photo.base64 };
  } catch {
    return photo;
  }
}

function Icon({ name, size = 22, color = C.ink }: { name: string; size?: number; color?: string }) {
  return <Ionicons name={name as never} size={size} color={color} />;
}

function PrimaryButton({ label, onPress, disabled, icon }: { label: string; onPress: () => void; disabled?: boolean; icon?: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.primary, disabled && s.disabled, pressed && !disabled && s.pressed]}>
    <Text style={s.primaryText}>{label}</Text>{icon && <Icon name={icon} size={20} color={C.white} />}
  </Pressable>;
}

function TopBar({ title, onBack, action }: { title: string; onBack?: () => void; action?: React.ReactNode }) {
  return <View style={s.topBar}>
    <Pressable onPress={onBack} hitSlop={12} style={s.topSide}>{onBack && <Icon name="chevron-back" />}</Pressable>
    <Text style={s.topTitle}>{title}</Text><View style={[s.topSide, { alignItems: "flex-end" }]}>{action}</View>
  </View>;
}

function Home({ begin, resume }: { begin: () => void; resume?: () => void }) {
  return <ScrollView contentContainerStyle={s.home} showsVerticalScrollIndicator={false}>
    <View style={s.brandRow}><View style={s.brandMark}><Icon name="sparkles" size={20} color={C.white} /></View><Text style={s.brand}>RoomMuse</Text></View>
    <View style={s.heroArt}>
      <LinearGradient colors={["#D9D0C0", "#F2EDE3"]} style={StyleSheet.absoluteFill} />
      <View style={s.window}><View style={s.windowLine} /></View>
      <View style={s.sofa}><View style={s.sofaBack} /><View style={s.sofaSeat} /><View style={s.sofaLegs} /></View>
      <View style={s.plant}><Text style={{ fontSize: 64 }}>♧</Text></View>
      <View style={s.heroBadge}><Icon name="color-palette-outline" size={16} color={C.forest} /><Text style={s.heroBadgeText}>Your personal interior studio</Text></View>
    </View>
    <Text style={s.eyebrow}>DESIGN WITH CONFIDENCE</Text>
    <Text style={s.heroTitle}>See the room{`\n`}you've imagined.</Text>
    <Text style={s.heroCopy}>Capture your space, explore designer-curated styles, and turn the final look into a practical shopping plan.</Text>
    <PrimaryButton label="Scan a room" icon="scan-outline" onPress={begin} />
    {resume && <Pressable onPress={resume} style={s.secondary}><Icon name="bag-check-outline" color={C.forest} /><Text style={s.secondaryText}>View saved shopping plan</Text></Pressable>}
    <View style={s.promiseRow}>{[["camera-outline", "3 guided angles"], ["sparkles-outline", "AI concept"], ["bag-handle-outline", "Shop the look"]].map(([icon,label]) => <View style={s.promise} key={label}><Icon name={icon!} size={18} color={C.sage} /><Text style={s.promiseText}>{label}</Text></View>)}</View>
  </ScrollView>;
}

function Capture({ onBack, onDone }: { onBack: () => void; onDone: (photos: Photo[]) => void }) {
  const camera = useRef<CameraView>(null); const [permission, requestPermission] = useCameraPermissions();
  const [photos, setPhotos] = useState<Photo[]>([]); const [busy, setBusy] = useState(false);
  const labels = ["Stand at the doorway", "Turn toward the main wall", "Capture the opposite corner"];
  const take = async () => { if (!camera.current || busy) return; setBusy(true); try { const shot = await camera.current.takePictureAsync({ base64: true, quality: 0.55, skipProcessing: false }); if (shot) { const prepared = await preparePhoto({ uri: shot.uri, base64: shot.base64 }); setPhotos(p => [...p, prepared].slice(0, 3)); } } finally { setBusy(false); } };
  const choose = async () => { const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [4, 3], quality: 0.65, base64: true }); if (!result.canceled) { const asset = result.assets[0]; if (asset) { const prepared = await preparePhoto({ uri: asset.uri, base64: asset.base64 ?? undefined }); onDone([prepared]); } } };
  if (!permission) return <View style={s.center}><ActivityIndicator color={C.forest} /></View>;
  if (!permission.granted) return <SafeAreaView style={s.permission}><View style={s.permissionIcon}><Icon name="camera-outline" size={34} color={C.forest} /></View><Text style={s.sectionTitle}>Camera access</Text><Text style={s.bodyCentered}>RoomMuse needs the camera only while you capture your room.</Text><PrimaryButton label="Allow camera" onPress={requestPermission} /><Pressable onPress={choose}><Text style={s.textLink}>Choose a photo instead</Text></Pressable></SafeAreaView>;
  return <View style={s.cameraPage}><CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" />
    <LinearGradient colors={["rgba(0,0,0,.6)", "transparent", "rgba(0,0,0,.72)"]} locations={[0, .5, 1]} style={StyleSheet.absoluteFill} />
    <SafeAreaView style={s.cameraUi} edges={["top", "bottom"]}><TopBar title="Room scan" onBack={onBack} action={<Text style={s.cameraCount}>{photos.length}/3</Text>} />
      <View style={s.guide}><Text style={s.guideStep}>STEP {Math.min(photos.length + 1, 3)} OF 3</Text><Text style={s.guideTitle}>{labels[Math.min(photos.length, 2)]}</Text><Text style={s.guideBody}>Keep the floor and ceiling edges visible. Move slowly and use natural light.</Text></View>
      <View style={s.scanFrame}><View style={[s.corner, s.tl]} /><View style={[s.corner, s.tr]} /><View style={[s.corner, s.bl]} /><View style={[s.corner, s.br]} /></View>
      <View style={s.captureBottom}><View style={s.thumbs}>{[0,1,2].map(i => photos[i] ? <Image key={i} source={{ uri: photos[i]!.uri }} style={s.thumb as ImageStyle} /> : <View key={i} style={s.thumbEmpty}><Text style={s.thumbNumber}>{i+1}</Text></View>)}</View>
        {photos.length < 3 ? <Pressable onPress={take} style={s.shutter} disabled={busy}><View style={s.shutterInner}>{busy && <ActivityIndicator color={C.forest} />}</View></Pressable> : <PrimaryButton label="Use this scan" icon="arrow-forward" onPress={() => onDone(photos)} />}
        <Pressable onPress={choose}><Text style={s.cameraLink}>Use one photo instead</Text></Pressable>
      </View></SafeAreaView></View>;
}

function StylePicker({ photo, onBack, onSelect, error }: { photo?: Photo; onBack: () => void; onSelect: (style: DesignStyle) => void; error?: string }) {
  const [selected, setSelected] = useState<DesignStyle>(designStyles[0]!);
  return <SafeAreaView style={s.page}><TopBar title="Choose a direction" onBack={onBack} />
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <Text style={s.sectionTitle}>What should this room feel like?</Text><Text style={s.body}>Start with a style. Your concept will still be tailored to the proportions and character of your space.</Text>{error && <View style={s.errorCard}><Icon name="alert-circle-outline" size={20} color="#9D3D35" /><Text style={s.errorText}>{error}</Text></View>}
      {photo && <Image source={{ uri: photo.uri }} style={s.photoStrip as ImageStyle} />}
      <View style={s.styleGrid}>{designStyles.map(style => { const active = style.id === selected.id; return <Pressable key={style.id} onPress={() => setSelected(style)} style={[s.styleCard, active && s.styleCardActive]}>
        <LinearGradient colors={[style.colors[2], style.colors[0]]} style={s.styleSwatch}><View style={[s.colorDot,{backgroundColor:style.colors[1]}]} /><View style={[s.colorDot,{backgroundColor:style.colors[0]}]} /><Icon name={style.icon} size={23} color={style.colors[1]} /></LinearGradient>
        <View style={s.styleText}><Text style={s.styleName}>{style.name}</Text><Text style={s.styleSub}>{style.subtitle}</Text></View>{active && <View style={s.check}><Icon name="checkmark" size={15} color={C.white} /></View>}
      </Pressable> })}</View>
    </ScrollView><View style={s.bottomBar}><PrimaryButton label={`Create ${selected.name} concept`} icon="sparkles" onPress={() => onSelect(selected)} /></View>
  </SafeAreaView>;
}

function Generating({ photo, style }: { photo?: Photo; style: DesignStyle }) {
  useKeepAwake();
  return <View style={s.generating}>{photo && <Image source={{uri: photo.uri}} style={StyleSheet.absoluteFill as ImageStyle} blurRadius={6} />}<View style={s.generatingShade} /><SafeAreaView style={s.generateContent}><View style={s.orbit}><View style={s.orbitInner}><Icon name="sparkles" size={34} color={C.white} /></View></View><Text style={s.generateTitle}>Composing your{`\n`}{style.name} room</Text><Text style={s.generateBody}>Balancing layout, palette, lighting, and pieces that work together.</Text><ActivityIndicator color={C.white} style={{marginTop:24}} /></SafeAreaView></View>;
}

function Result({ photo, concept, onBack, onAccept }: { photo?: Photo; concept: DesignConcept; onBack: () => void; onAccept: () => void }) {
  const [after, setAfter] = useState(true); const visual = after && concept.imageDataUrl ? concept.imageDataUrl : (concept.beforeImageUrl ?? photo?.uri);
  return <SafeAreaView style={s.page}><TopBar title="Your concept" onBack={onBack} action={<Pressable onPress={() => Alert.alert("Saved", "This concept is saved on your phone.")}><Icon name="bookmark-outline" /></Pressable>} />
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom:120}}>
      <View style={s.resultImage}>{visual ? <Image source={{uri:visual}} style={StyleSheet.absoluteFill as ImageStyle} /> : <LinearGradient colors={["#D7CBB7","#EEE8DC"]} style={StyleSheet.absoluteFill} />}<LinearGradient colors={["transparent","rgba(0,0,0,.55)"]} style={StyleSheet.absoluteFill} />
        <View style={s.toggle}><Pressable onPress={() => setAfter(false)} style={[s.togglePart,!after&&s.toggleActive]}><Text style={[s.toggleText,!after&&s.toggleTextActive]}>Before</Text></Pressable><Pressable onPress={() => setAfter(true)} style={[s.togglePart,after&&s.toggleActive]}><Text style={[s.toggleText,after&&s.toggleTextActive]}>After</Text></Pressable></View>
        <View style={s.resultLabel}><Text style={s.resultStyle}>{concept.style.toUpperCase()}</Text><Text style={s.resultTitle}>{concept.title}</Text></View>
      </View>
      {!concept.imageDataUrl && <View style={s.demoNote}><Icon name="information-circle-outline" size={19} color={C.forest} /><Text style={s.demoText}>Concept preview is in demo mode. Connect the local AI studio to render a redesigned room image.</Text></View>}
      <View style={s.resultContent}><Text style={s.summary}>{concept.summary}</Text><Text style={s.miniHeading}>PALETTE</Text><View style={s.palette}>{concept.palette.map((color,i)=><View key={color} style={[s.paletteDot,{backgroundColor:color,zIndex:5-i}]} />)}</View>
        <Text style={s.miniHeading}>DESIGN MOVES</Text>{concept.principles.map((p,i)=><View style={s.principle} key={p}><Text style={s.principleNum}>0{i+1}</Text><Text style={s.principleText}>{p}</Text></View>)}
      </View>
    </ScrollView><View style={s.bottomBar}><PrimaryButton label="Love it — build my list" icon="bag-check-outline" onPress={onAccept} /></View>
  </SafeAreaView>;
}

function Shopping({ concept, onHome, onChange }: { concept: DesignConcept; onHome: () => void; onChange: (c: DesignConcept) => void }) {
  const categories = Array.from(new Set(concept.shoppingItems.map(i=>i.category))); const total = concept.shoppingItems.reduce((sum,i)=>sum+i.unitPrice*i.quantity,0);
  const toggle = (id:string) => onChange({...concept,shoppingItems:concept.shoppingItems.map(i=>i.id===id?{...i,checked:!i.checked}:i)});
  return <SafeAreaView style={s.page}><TopBar title="Shopping plan" onBack={onHome} action={<Pressable onPress={() => Alert.alert("Share", "Use the retailer links to shop each item.")}><Icon name="share-outline" /></Pressable>} />
    <ScrollView contentContainerStyle={{paddingBottom:80}} showsVerticalScrollIndicator={false}>{(concept.beforeImageUrl || concept.imageDataUrl) && <View style={s.savedVisuals}><Text style={s.categoryTitle}>Saved room views</Text><View style={s.compareRow}>{concept.beforeImageUrl && <View style={s.compareCard}><Image source={{uri:concept.beforeImageUrl}} style={s.compareImage as ImageStyle} /><Text style={s.compareLabel}>BEFORE</Text></View>}{concept.imageDataUrl && <View style={s.compareCard}><Image source={{uri:concept.imageDataUrl}} style={s.compareImage as ImageStyle} /><Text style={s.compareLabel}>AFTER � {concept.style.toUpperCase()}</Text></View>}</View></View>}<View style={s.budgetCard}><Text style={s.miniHeadingLight}>ESTIMATED PROJECT TOTAL</Text><Text style={s.total}>${total.toLocaleString()}</Text><Text style={s.totalNote}>Before tax, shipping, and installation</Text><View style={s.budgetLine}><View style={{width:"72%",height:5,borderRadius:3,backgroundColor:C.clay}} /></View><Text style={s.estimateNote}>Prices are estimates. Confirm current price and availability with each retailer.</Text></View>
      {categories.map(category=><View key={category} style={s.category}><Text style={s.categoryTitle}>{category}</Text>{concept.shoppingItems.filter(i=>i.category===category).map(item=><View key={item.id} style={s.shopItem}>
        <Pressable onPress={()=>toggle(item.id)} style={[s.itemCheck,item.checked&&s.itemChecked]}>{item.checked&&<Icon name="checkmark" size={14} color={C.white}/>}</Pressable><View style={s.itemBody}><Text style={[s.itemName,item.checked&&s.strike]}>{item.quantity>1?`${item.quantity}× `:""}{item.name}</Text><Text style={s.itemDescription}>{item.description}</Text><Pressable onPress={()=>Linking.openURL(item.purchaseUrl)} style={s.retailer}><Text style={s.retailerText}>{item.retailer}</Text><Icon name="open-outline" size={14} color={C.forest}/></Pressable></View><Text style={s.price}>${(item.unitPrice*item.quantity).toLocaleString()}</Text>
      </View>)}</View>)}
      <Pressable onPress={onHome} style={s.newRoom}><Icon name="add-circle-outline" color={C.forest}/><Text style={s.secondaryText}>Design another room</Text></Pressable>
    </ScrollView></SafeAreaView>;
}

function AppContent() {
  const [route,setRoute]=useState<Route>("home"); const [photos,setPhotos]=useState<Photo[]>([]); const [selected,setSelected]=useState<DesignStyle>(designStyles[0]!); const [concept,setConcept]=useState<DesignConcept>(); const [generationError,setGenerationError]=useState<string>();
  useEffect(()=>{AsyncStorage.getItem("roommuse.concept").then(v=>{if(v)setConcept(JSON.parse(v) as DesignConcept)}).catch(()=>undefined)},[]);
  const generate=async(style:DesignStyle)=>{setGenerationError(undefined);setSelected(style);setRoute("generating");try{const next=await createDesign(photos[0]?.base64,style);setConcept(next);setRoute("result");AsyncStorage.setItem("roommuse.concept",JSON.stringify(next)).catch(()=>Alert.alert("Concept created", "The images are ready, but the saved-plan index could not be updated."))}catch(e){const message=e instanceof Error?e.message:"Please try again.";setGenerationError(message);Alert.alert("Could not create the concept",message);setRoute("style")}};
  const updateConcept=(next:DesignConcept)=>{setConcept(next);AsyncStorage.setItem("roommuse.concept",JSON.stringify(next)).catch(()=>undefined)};
  return <>{route==="home"&&<Home begin={()=>{setGenerationError(undefined);setPhotos([]);setRoute("capture")}} resume={concept?()=>setRoute("shopping"):undefined}/>} {route==="capture"&&<Capture onBack={()=>setRoute("home")} onDone={p=>{setGenerationError(undefined);setPhotos(p);setRoute("style")}}/>} {route==="style"&&<StylePicker photo={photos[0]} error={generationError} onBack={()=>setRoute("capture")} onSelect={generate}/>} {route==="generating"&&<Generating photo={photos[0]} style={selected}/>} {route==="result"&&concept&&<Result photo={photos[0]} concept={concept} onBack={()=>setRoute("style")} onAccept={()=>setRoute("shopping")}/>} {route==="shopping"&&concept&&<Shopping concept={concept} onHome={()=>setRoute("home")} onChange={updateConcept}/>}</>;
}

export { default } from "./src/RoomMuseApp";

const s=StyleSheet.create({
  page:{flex:1,backgroundColor:C.paper},center:{flex:1,alignItems:"center",justifyContent:"center"},content:{padding:22,paddingBottom:120},home:{padding:22,paddingTop:58,paddingBottom:36,backgroundColor:C.paper},brandRow:{flexDirection:"row",alignItems:"center",gap:10,marginBottom:22},brandMark:{width:36,height:36,borderRadius:12,alignItems:"center",justifyContent:"center",backgroundColor:C.forest},brand:{fontSize:21,fontWeight:"700",letterSpacing:-.5,color:C.ink},heroArt:{height:245,borderRadius:28,overflow:"hidden",marginBottom:28},window:{position:"absolute",right:28,top:22,width:105,height:110,borderWidth:7,borderColor:"rgba(255,255,255,.7)",backgroundColor:"#C9D4D1"},windowLine:{position:"absolute",left:45,top:0,bottom:0,width:6,backgroundColor:"rgba(255,255,255,.7)"},sofa:{position:"absolute",left:26,bottom:38,width:190,height:92},sofaBack:{height:59,borderRadius:19,backgroundColor:"#817C70"},sofaSeat:{height:28,marginTop:-12,borderRadius:11,backgroundColor:"#68665E"},sofaLegs:{width:150,height:8,alignSelf:"center",backgroundColor:"#403E38"},plant:{position:"absolute",right:14,bottom:34,transform:[{rotate:"-10deg"}]},heroBadge:{position:"absolute",left:16,bottom:14,flexDirection:"row",gap:7,alignItems:"center",backgroundColor:"rgba(255,255,255,.9)",paddingHorizontal:12,paddingVertical:8,borderRadius:99},heroBadgeText:{fontSize:12,fontWeight:"600",color:C.forest},eyebrow:{fontSize:11,fontWeight:"800",letterSpacing:1.8,color:C.clay,marginBottom:10},heroTitle:{fontFamily:"Georgia",fontSize:43,lineHeight:48,letterSpacing:-1.2,color:C.ink},heroCopy:{fontSize:16,lineHeight:24,color:"#59615B",marginTop:15,marginBottom:24},primary:{height:58,borderRadius:18,backgroundColor:C.forest,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:10,paddingHorizontal:20},primaryText:{fontSize:16,fontWeight:"700",color:C.white},pressed:{opacity:.82,transform:[{scale:.99}]},disabled:{opacity:.45},secondary:{height:52,marginTop:10,borderRadius:16,flexDirection:"row",gap:9,alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:C.line},secondaryText:{fontSize:15,fontWeight:"600",color:C.forest},promiseRow:{flexDirection:"row",justifyContent:"space-between",marginTop:26},promise:{alignItems:"center",gap:6},promiseText:{fontSize:11,color:"#6C736E"},topBar:{height:54,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:18},topSide:{width:46},topTitle:{fontSize:16,fontWeight:"700",color:C.ink},permission:{flex:1,backgroundColor:C.paper,alignItems:"center",justifyContent:"center",padding:30,gap:18},permissionIcon:{width:70,height:70,borderRadius:24,backgroundColor:"#E3EBE4",alignItems:"center",justifyContent:"center"},sectionTitle:{fontFamily:"Georgia",fontSize:31,lineHeight:38,color:C.ink,marginBottom:8},body:{fontSize:15,lineHeight:23,color:"#68706A",marginBottom:20},bodyCentered:{fontSize:15,lineHeight:23,color:"#68706A",textAlign:"center",marginBottom:10},textLink:{color:C.forest,fontWeight:"700",padding:10},cameraPage:{flex:1,backgroundColor:"#000"},cameraUi:{flex:1,justifyContent:"space-between"},cameraCount:{color:C.white,fontWeight:"700"},cameraPageTitle:{color:C.white},guide:{paddingHorizontal:24,alignItems:"center"},guideStep:{fontSize:11,letterSpacing:1.7,fontWeight:"800",color:"#D7D2C6"},guideTitle:{fontFamily:"Georgia",fontSize:27,color:C.white,marginTop:6,textAlign:"center"},guideBody:{fontSize:13,lineHeight:19,color:"rgba(255,255,255,.76)",textAlign:"center",marginTop:7,maxWidth:300},scanFrame:{position:"absolute",left:35,right:35,top:"31%",height:"31%"},corner:{position:"absolute",width:34,height:34,borderColor:C.white},tl:{left:0,top:0,borderLeftWidth:3,borderTopWidth:3,borderTopLeftRadius:7},tr:{right:0,top:0,borderRightWidth:3,borderTopWidth:3,borderTopRightRadius:7},bl:{left:0,bottom:0,borderLeftWidth:3,borderBottomWidth:3,borderBottomLeftRadius:7},br:{right:0,bottom:0,borderRightWidth:3,borderBottomWidth:3,borderBottomRightRadius:7},captureBottom:{padding:20,alignItems:"center",gap:15},thumbs:{flexDirection:"row",gap:8},thumb:{width:46,height:46,borderRadius:9,borderWidth:2,borderColor:C.white},thumbEmpty:{width:46,height:46,borderRadius:9,borderWidth:1,borderColor:"rgba(255,255,255,.45)",alignItems:"center",justifyContent:"center"},thumbNumber:{color:C.white,fontWeight:"700"},shutter:{width:76,height:76,borderRadius:38,borderWidth:4,borderColor:C.white,padding:5},shutterInner:{flex:1,borderRadius:31,backgroundColor:C.white,alignItems:"center",justifyContent:"center"},cameraLink:{color:C.white,fontSize:13,fontWeight:"600",padding:5},errorCard:{flexDirection:"row",gap:9,alignItems:"flex-start",padding:13,borderRadius:14,backgroundColor:"#F8E8E5",borderWidth:1,borderColor:"#E7BDB7",marginBottom:16},errorText:{flex:1,fontSize:12,lineHeight:18,color:"#7D312B"},photoStrip:{height:132,borderRadius:20,marginBottom:20},styleGrid:{gap:11},styleCard:{minHeight:88,borderRadius:19,borderWidth:1,borderColor:C.line,backgroundColor:C.white,flexDirection:"row",alignItems:"center",padding:10},styleCardActive:{borderWidth:2,borderColor:C.forest,backgroundColor:"#F5F8F3"},styleSwatch:{width:70,height:66,borderRadius:14,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:5},colorDot:{width:15,height:15,borderRadius:8},styleText:{flex:1,paddingHorizontal:14},styleName:{fontSize:16,fontWeight:"700",color:C.ink},styleSub:{fontSize:12,color:"#737A75",marginTop:4},check:{width:24,height:24,borderRadius:12,backgroundColor:C.forest,alignItems:"center",justifyContent:"center",marginRight:5},bottomBar:{position:"absolute",left:0,right:0,bottom:0,padding:16,paddingBottom:20,backgroundColor:"rgba(252,251,247,.96)",borderTopWidth:1,borderTopColor:C.line},generating:{flex:1,backgroundColor:C.forest},generatingShade:{...StyleSheet.absoluteFillObject,backgroundColor:"rgba(23,40,31,.78)"},generateContent:{flex:1,alignItems:"center",justifyContent:"center",padding:32},orbit:{width:96,height:96,borderRadius:48,borderWidth:1,borderColor:"rgba(255,255,255,.35)",padding:12,marginBottom:30},orbitInner:{flex:1,borderRadius:38,backgroundColor:C.clay,alignItems:"center",justifyContent:"center"},generateTitle:{fontFamily:"Georgia",fontSize:36,lineHeight:43,color:C.white,textAlign:"center"},generateBody:{fontSize:15,lineHeight:23,color:"rgba(255,255,255,.75)",textAlign:"center",marginTop:15},resultImage:{height:420,overflow:"hidden",backgroundColor:"#DDD"},toggle:{position:"absolute",top:16,alignSelf:"center",flexDirection:"row",backgroundColor:"rgba(20,25,21,.55)",borderRadius:99,padding:4},togglePart:{paddingHorizontal:18,paddingVertical:8,borderRadius:99},toggleActive:{backgroundColor:C.white},toggleText:{fontSize:12,fontWeight:"700",color:C.white},toggleTextActive:{color:C.ink},resultLabel:{position:"absolute",left:22,bottom:22},resultStyle:{fontSize:11,fontWeight:"800",letterSpacing:1.7,color:"#E8D4C5"},resultTitle:{fontFamily:"Georgia",fontSize:32,color:C.white,marginTop:5},demoNote:{flexDirection:"row",gap:9,backgroundColor:"#E8EFE8",padding:14,margin:18,borderRadius:14},demoText:{flex:1,fontSize:12,lineHeight:17,color:C.forest},resultContent:{paddingHorizontal:22},summary:{fontSize:17,lineHeight:27,color:"#4E5751",marginBottom:26},miniHeading:{fontSize:10,fontWeight:"800",letterSpacing:1.7,color:"#7B817D",marginTop:10,marginBottom:12},palette:{flexDirection:"row",marginBottom:25},paletteDot:{width:42,height:42,borderRadius:21,marginRight:-7,borderWidth:2,borderColor:C.paper},principle:{flexDirection:"row",alignItems:"center",paddingVertical:15,borderBottomWidth:1,borderBottomColor:C.line},principleNum:{width:40,fontSize:11,fontWeight:"800",color:C.clay},principleText:{flex:1,fontSize:15,color:C.ink},savedVisuals:{paddingHorizontal:18,paddingTop:20},compareRow:{flexDirection:"row",gap:10},compareCard:{flex:1,borderRadius:18,overflow:"hidden",backgroundColor:C.white,borderWidth:1,borderColor:C.line},compareImage:{width:"100%",height:150},compareLabel:{fontSize:9,fontWeight:"800",letterSpacing:1.1,color:C.forest,paddingHorizontal:10,paddingVertical:9},budgetCard:{margin:18,padding:22,borderRadius:24,backgroundColor:C.forest},miniHeadingLight:{fontSize:10,fontWeight:"800",letterSpacing:1.5,color:"#C9D8CD"},total:{fontFamily:"Georgia",fontSize:42,color:C.white,marginTop:8},totalNote:{fontSize:12,color:"#C7D3CA",marginTop:4},budgetLine:{height:5,borderRadius:3,backgroundColor:"rgba(255,255,255,.16)",marginTop:20},estimateNote:{fontSize:11,lineHeight:16,color:"#AFC0B4",marginTop:12},category:{paddingHorizontal:20,marginTop:12},categoryTitle:{fontFamily:"Georgia",fontSize:23,color:C.ink,marginBottom:5},shopItem:{flexDirection:"row",alignItems:"flex-start",paddingVertical:17,borderBottomWidth:1,borderBottomColor:C.line},itemCheck:{width:22,height:22,borderRadius:7,borderWidth:1.5,borderColor:"#AEB4AF",marginRight:12,alignItems:"center",justifyContent:"center"},itemChecked:{backgroundColor:C.forest,borderColor:C.forest},itemBody:{flex:1},itemName:{fontSize:15,fontWeight:"700",color:C.ink},strike:{textDecorationLine:"line-through",color:"#89908B"},itemDescription:{fontSize:12,color:"#7A817C",marginTop:3},retailer:{flexDirection:"row",alignItems:"center",gap:4,marginTop:8},retailerText:{fontSize:12,fontWeight:"700",color:C.forest},price:{fontSize:14,fontWeight:"700",color:C.ink,marginLeft:8},newRoom:{margin:24,height:54,borderRadius:17,borderWidth:1,borderColor:C.line,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:8}
});
