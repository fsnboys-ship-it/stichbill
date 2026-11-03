export type Term={id:string;name:string;active:boolean;version:number};
export type Shop={id:string;name:string;active:boolean};
export type Branch={id:string;shop_id:string;name:string;active:boolean};
export type Variant={id:string;productId:string;sku:string;size:string;colour:string;active:boolean;version:number;costPrice?:string;sellingPrice:string;mrp:string;barcodes:string[]};
export type Product={id:string;styleCode:string;name:string;description:string;categoryId:string|null;brandId:string|null;categoryName:string|null;brandName:string|null;hsnCode:string;imageId:string|null;active:boolean;version:number;shopIds:string[];variants:Variant[]};
export type CatalogueData={owner:boolean;products:Product[];categories:Term[];brands:Term[];total:number;page:number;pageSize:number};
export type VariantDraft={key:string;id:string|null;version:number|null;sku:string;size:string;colour:string;active:boolean;costPrice:string;sellingPrice:string;mrp:string;barcodesText:string};
export function variantDraft(value?:Variant):VariantDraft{return{key:value?.id??crypto.randomUUID(),id:value?.id??null,version:value?.version??null,sku:value?.sku??'',size:value?.size??'NA',colour:value?.colour??'NA',active:value?.active??true,costPrice:value?.costPrice??'0.00',sellingPrice:value?.sellingPrice??'0.00',mrp:value?.mrp??'0.00',barcodesText:value?.barcodes.join('\n')??''};}
export function variantBody(draft:VariantDraft){const{key:_,barcodesText,...body}=draft;void _;return{...body,barcodes:barcodesText.split(/\r?\n/).map(v=>v.trim()).filter(Boolean)};}
export function money(value:string){const[whole,fraction='']=value.split('.');const decimals=fraction.replace(/0+$/,'').padEnd(2,'0');return '₹'+BigInt(whole||'0').toLocaleString('en-IN')+'.'+decimals;}
