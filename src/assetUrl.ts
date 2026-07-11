const API_URL=(process.env.EXPO_PUBLIC_API_URL??(typeof window!=="undefined"?`${window.location.protocol}//${window.location.hostname}:8787`:"")).replace(/\/$/,"");
export function assetUrl(uri?:string,apiRoot=API_URL){
  if(!uri)return undefined;
  const marker="/designs/",index=uri.indexOf(marker);
  return apiRoot&&index>=0?apiRoot.replace(/\/$/,"")+uri.slice(index):uri;
}
