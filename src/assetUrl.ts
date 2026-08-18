import{API_BASE_URL}from"./runtimeEnv";
export function assetUrl(uri?:string,apiRoot=API_BASE_URL){
  if(!uri)return undefined;
  const marker="/designs/",index=uri.indexOf(marker);
  return apiRoot&&index>=0?apiRoot.replace(/\/$/,"")+uri.slice(index):uri;
}
