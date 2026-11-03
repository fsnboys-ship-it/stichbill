import { z } from 'zod';
export const decimalPrice = z.string().regex(/^[0-9]{1,14}(\.[0-9]{1,6})?$/, 'Use a non-negative amount with up to six decimal places');
const id = z.uuid().nullable();
const version = z.number().int().positive().nullable();
const identifier = (max: number) => z.string().trim().toUpperCase().min(1).max(max).regex(/^[A-Z0-9][A-Z0-9._/-]*$/);
export const scopeInput = z.object({ shopId: z.uuid(), branchId: z.uuid().optional() }).strict();
export const listInput = scopeInput.extend({ search:z.string().trim().max(120).default(''),status:z.enum(['active','inactive','all']).default('active'),categoryId:z.uuid().optional(),brandId:z.uuid().optional(),page:z.coerce.number().int().min(1).max(999999).default(1) });
export const termInput = z.object({id,version,name:z.string().trim().min(1).max(120),active:z.boolean()}).strict().refine(p=>(p.id===null)===(p.version===null),'Existing records require a version');
export const variantFields = z.object({id,version,sku:identifier(64),size:z.string().trim().toUpperCase().min(1).max(40),colour:z.string().trim().toUpperCase().min(1).max(60),active:z.boolean(),costPrice:decimalPrice,sellingPrice:decimalPrice,mrp:decimalPrice,barcodes:z.array(z.string().trim().regex(/^[!-~]{1,64}$/)).max(10)}).strict();
// Decimal comparison in scaled bigint, never a floating-point money calculation.
export function decimalUnits(value:string):bigint { const [whole,fraction='']=value.split('.');return BigInt(whole!)*1000000n+BigInt(fraction.padEnd(6,'0')); }
export const variantInput = variantFields.refine(p=>(p.id===null)===(p.version===null),'Existing records require a version').refine(p=>new Set(p.barcodes).size===p.barcodes.length,'Barcode aliases must be distinct').refine(p=>!decimalPrice.safeParse(p.sellingPrice).success || !decimalPrice.safeParse(p.mrp).success || decimalUnits(p.sellingPrice)<=decimalUnits(p.mrp),'Selling price cannot exceed MRP');
export const productFields = z.object({id,version,styleCode:identifier(40),name:z.string().trim().min(1).max(160),description:z.string().trim().max(2000),categoryId:id,brandId:id,hsnCode:z.string().trim().regex(/^([0-9]{4,8})?$/),active:z.boolean(),shopIds:z.array(z.uuid()).min(1).max(50),variants:z.array(variantInput).max(50)}).strict();
export const productInput = productFields.refine(p=>(p.id===null)===(p.version===null),'Existing records require a version').refine(p=>new Set(p.shopIds).size===p.shopIds.length,'Shops must be distinct').refine(p=>p.id!==null || (p.variants.length>0 && p.variants.every(v=>v.id===null)),'New products require new variants').refine(p=>p.id===null || p.variants.length===0,'Edit existing variants separately');
export const imageInput = z.object({version:z.number().int().positive(),base64:z.string().max(2796204).nullable()}).strict();
