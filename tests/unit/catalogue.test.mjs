import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {decimalPrice,decimalUnits,variantInput,productInput,termInput,listInput} from '../../apps/api/dist/catalogue/validation.js';
import {inspectImage} from '../../apps/api/dist/catalogue/storage.js';
import {money,variantBody,variantDraft} from '../../apps/web/src/catalogue-model.ts';
const variant={id:null,version:null,sku:'shirt-s-red',size:'s',colour:'red',active:true,costPrice:'10.123456',sellingPrice:'99.999999',mrp:'100',barcodes:['0000123','ALIAS-2']};
test('catalogue price precision is exact and invalid monetary values are rejected',()=>{
 assert.equal(decimalUnits('99999999999999.123456'),99999999999999123456n);
 for(const value of ['-1','1e3','NaN','Infinity','1.1234567','100000000000000','1,000',''])assert.equal(decimalPrice.safeParse(value).success,false);
 for(const value of ['NaN','1e3','-1',12.34])assert.equal(variantInput.safeParse({...variant,sellingPrice:value}).success,false);
 assert.equal(variantInput.safeParse({...variant,sellingPrice:'101',mrp:'100'}).success,false);
 assert.equal(money('99999999999999.123456'),'₹9,99,99,99,99,99,999.123456');
});
test('variant identifiers normalize; duplicates, fabricated permissions and stale shapes are rejected',()=>{
 const parsed=variantInput.parse(variant);assert.equal(parsed.sku,'SHIRT-S-RED');assert.equal(parsed.size,'S');assert.equal(parsed.colour,'RED');assert.equal(parsed.barcodes[0],'0000123');
 for(const patch of [{barcodes:['X','X']},{role:'owner'},{tenantId:randomUUID()},{id:randomUUID(),version:null},{size:''}])assert.equal(variantInput.safeParse({...variant,...patch}).success,false);
 const draft=variantDraft();draft.barcodesText='000123\nABCD\n';assert.deepEqual(variantBody(draft).barcodes,['000123','ABCD']);assert.ok(!('key' in variantBody(draft)));
});
test('new product requires atomic initial variants, scoped shops and bounded metadata',()=>{
 const shop=randomUUID(),product={id:null,version:null,styleCode:'SHIRT',name:'Shirt',description:'',categoryId:null,brandId:null,hsnCode:'6205',active:true,shopIds:[shop],variants:[variant]};
 assert.equal(productInput.safeParse(product).success,true);
 for(const patch of [{variants:[]},{shopIds:[shop,shop]},{hsnCode:'GST-5%'},{name:''},{permissions:['write']},{variants:[{...variant,active:'true'}]}])assert.equal(productInput.safeParse({...product,...patch}).success,false);
 assert.equal(termInput.safeParse({id:null,version:null,name:'  Shirts  ',active:true}).success,true);
 assert.equal(listInput.safeParse({shopId:shop,role:'owner'}).success,false);
});
test('image inspection accepts a real small PNG and rejects scripts, corrupt base64 and size tricks',()=>{
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
 const result=inspectImage(png);assert.equal(result.mime,'image/png');assert.equal(result.width,1);assert.equal(result.height,1);
 for(const value of [Buffer.from('<svg onload=alert(1)></svg>').toString('base64'),'not base64',png+'!',''])assert.throws(()=>inspectImage(value));
 const big=Buffer.from(png,'base64');big.writeUInt32BE(5000,16);assert.throws(()=>inspectImage(big.toString('base64')));
});
