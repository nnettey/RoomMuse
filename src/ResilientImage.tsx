import React,{useEffect,useMemo,useState}from"react";
import{ActivityIndicator,Image,Pressable,StyleSheet,Text,View,type ImageResizeMode,type ImageStyle,type StyleProp}from"react-native";
import{assetUrl}from"./assetUrl";

export function ResilientImage({uri,fallbackUri,style,resizeMode="cover",label="Design image"}:{uri?:string;fallbackUri?:string;style?:StyleProp<ImageStyle>;resizeMode?:ImageResizeMode;label?:string}){
  const candidates=useMemo(()=>Array.from(new Set([assetUrl(uri),assetUrl(fallbackUri)].filter(Boolean))) as string[],[uri,fallbackUri]);
  const[index,setIndex]=useState(0),[loading,setLoading]=useState(Boolean(candidates[0])),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0);
  useEffect(()=>{setIndex(0);setLoading(Boolean(candidates[0]));setFailed(!candidates[0]);setRetry(0)},[uri,fallbackUri]);
  const current=candidates[index];
  const fail=()=>{if(index+1<candidates.length){setIndex(index+1);setLoading(true);setFailed(false)}else{setLoading(false);setFailed(true)}};
  return<View style={[style,z.frame]}>{current&&!failed&&<Image key={current+retry} accessibilityLabel={label} source={{uri:current}} resizeMode={resizeMode} style={StyleSheet.absoluteFill} onLoadStart={()=>setLoading(true)} onLoad={()=>{setLoading(false);setFailed(false)}} onError={fail}/>} {loading&&<View style={z.overlay}><ActivityIndicator color="#244C3B"/><Text style={z.copy}>Loading room image…</Text></View>}{failed&&<View style={z.overlay}><Text style={z.title}>Room image unavailable</Text><Text style={z.copy}>Check the connection, then retry. Your design details remain saved.</Text><Pressable accessibilityRole="button" accessibilityLabel={"Retry "+label} onPress={()=>{setFailed(false);setLoading(true);setIndex(0);setRetry(x=>x+1)}} style={z.retry}><Text style={z.retryText}>Retry image</Text></Pressable></View>}</View>
}
const z=StyleSheet.create({frame:{overflow:"hidden",backgroundColor:"#E9E5DA"},overlay:{...StyleSheet.absoluteFillObject,alignItems:"center",justifyContent:"center",padding:18,backgroundColor:"#F2EFE7"},title:{fontSize:15,fontWeight:"800",color:"#17211B",textAlign:"center"},copy:{fontSize:12,lineHeight:18,color:"#68706A",textAlign:"center",marginTop:6},retry:{minHeight:44,justifyContent:"center",paddingHorizontal:16,marginTop:8,borderRadius:14,borderWidth:1,borderColor:"#244C3B"},retryText:{fontWeight:"800",color:"#244C3B"}});