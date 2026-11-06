import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import pg from 'pg';
import {removeUncommittedImage} from '../../apps/api/src/catalogue/storage';
test.use({trace:'off'});
test('mobile catalogue form components, images, variants, persistence and cashier read-only view',async({page,browser})=>{
 test.setTimeout(90000);
 const email=randomUUID()+'@example.test',staffEmail=randomUUID()+'@example.test',password='Synthetic-catalogue-browser-123';
 const env=parseEnv(await readFile('.env.test.db','utf8')),url=env.MIGRATION_DATABASE_URL;
 if(!url||new URL(url).pathname!=='/stichbill_test')throw new Error('Isolated test database required');
 const setup=new pg.Client({connectionString:url});await setup.connect();
 try{await setup.query('DELETE FROM stich_auth.attempt_buckets');}finally{await setup.end();}
 await page.setViewportSize({width:360,height:740});
 try{
  await page.goto('/');await page.getByRole('button',{name:'Create owner account',exact:true}).click();
  await page.getByLabel('Email address').fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Create account',exact:true}).click();
  await page.getByLabel('Business name').fill('Catalogue browser business');await page.getByLabel('Your name').fill('Catalogue owner');await page.getByRole('button',{name:'Create business',exact:true}).click();
  await page.getByLabel('Location code').fill('CAT');await page.getByLabel('Location name').fill('Catalogue shop');await page.getByLabel('Address',{exact:true}).fill('Test street');await page.getByLabel('Business contact').fill('Test contact');await page.getByRole('button',{name:'Save shop',exact:true}).click();
  await expect(page.getByRole('button',{name:'Edit shop CAT',exact:true})).toBeVisible();
  const catalogue=page.getByRole('region',{name:'Product catalogue',exact:true});
  await catalogue.getByRole('button',{name:'Reload shops'}).click();await expect(catalogue.getByText('No matching products',{exact:true})).toBeVisible();
  await catalogue.getByRole('button',{name:'Categories',exact:true}).click();await catalogue.getByLabel('Category name',{exact:true}).fill('Shirts');await catalogue.getByRole('button',{name:'Save category',exact:true}).click();await expect(catalogue.getByRole('button',{name:'Edit Shirts'})).toBeVisible();
  await catalogue.getByRole('button',{name:'Brands',exact:true}).click();await catalogue.getByLabel('Brand name',{exact:true}).fill('House label');await catalogue.getByRole('button',{name:'Save brand',exact:true}).click();await expect(catalogue.getByRole('button',{name:'Edit House label'})).toBeVisible();
  await catalogue.getByRole('button',{name:'Products',exact:true}).click();await catalogue.getByRole('button',{name:'Add product',exact:true}).click();
  const editor=catalogue.getByRole('form',{name:'Add product',exact:true});await editor.getByRole('button',{name:'Save product',exact:true}).click();expect(await editor.getByLabel('Product name').evaluate((input: HTMLInputElement)=>input.validity.valid)).toBe(false);
  await editor.getByLabel('Product name').fill('Cotton summer shirt');await editor.getByLabel('Style code').fill('COTTON-01');await editor.getByLabel('Product description').fill('Everyday cotton shirt');await editor.getByLabel('HSN metadata').fill('6205');
  await editor.getByLabel('Category',{exact:true}).selectOption({label:'Shirts'});await editor.getByLabel('Brand',{exact:true}).selectOption({label:'House label'});
  await editor.getByLabel('Variant 1 SKU',{exact:true}).fill('COTTON-S-RED');await editor.getByLabel('Variant 1 Size',{exact:true}).fill('S');await editor.getByLabel('Variant 1 Colour',{exact:true}).fill('RED');await editor.getByLabel('Variant 1 Cost price',{exact:true}).fill('50.123456');await editor.getByLabel('Variant 1 Selling price',{exact:true}).fill('99.50');await editor.getByLabel('Variant 1 MRP',{exact:true}).fill('149');await editor.getByLabel('Variant 1 Barcode aliases',{exact:true}).fill('00001234\nALIAS-RED');
  await editor.getByRole('button',{name:'Add variant row'}).click();await editor.getByLabel('Variant 2 SKU',{exact:true}).fill('COTTON-L-BLUE');await editor.getByLabel('Variant 2 Size',{exact:true}).fill('L');await editor.getByLabel('Variant 2 Colour',{exact:true}).fill('BLUE');await editor.getByLabel('Variant 2 Selling price',{exact:true}).fill('120');await editor.getByLabel('Variant 2 MRP',{exact:true}).fill('160');
  await editor.getByRole('button',{name:'Save product',exact:true}).click();await expect(catalogue.getByRole('article',{name:'Product details'})).toBeVisible();await expect(catalogue.getByText('COTTON-S-RED',{exact:true})).toBeVisible();await expect(catalogue.getByText('COTTON-L-BLUE',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await catalogue.getByLabel('Product image',{exact:true}).setInputFiles({name:'tiny.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')});
  await expect(catalogue.getByRole('img',{name:'Cotton summer shirt'})).toBeVisible();
  await catalogue.getByRole('button',{name:'Edit variant COTTON-S-RED',exact:true}).click();const variant=catalogue.getByRole('form',{name:'Variant management'});await variant.getByLabel('Variant Cost price',{exact:true}).fill('49.000001');await variant.getByRole('button',{name:'Save variant',exact:true}).click();await expect(catalogue.getByText(/Cost ₹49.000001/)).toBeVisible();
  await catalogue.getByRole('button',{name:'Add size / colour variant',exact:true}).click();await variant.getByLabel('Variant SKU',{exact:true}).fill('COTTON-M-GREEN');await variant.getByLabel('Variant Size',{exact:true}).fill('M');await variant.getByLabel('Variant Colour',{exact:true}).fill('GREEN');await variant.getByRole('button',{name:'Save variant',exact:true}).click();await expect(catalogue.getByText('COTTON-M-GREEN',{exact:true})).toBeVisible();
  await catalogue.getByRole('button',{name:'Edit product',exact:true}).click();const edit=catalogue.getByRole('form',{name:'Edit product'});await edit.getByLabel('Product name').fill('Updated cotton shirt');await edit.getByRole('button',{name:'Save product',exact:true}).click();await expect(catalogue.getByRole('heading',{name:'Updated cotton shirt',exact:true})).toBeVisible();
  await page.reload();await expect(catalogue.getByRole('button',{name:'View Updated cotton shirt',exact:true})).toBeVisible(); // real cookie/session + persistent DB records
  await catalogue.getByLabel('Search products').fill('00001234');await catalogue.getByRole('button',{name:'Search',exact:true}).click();await expect(catalogue.getByRole('button',{name:'View Updated cotton shirt',exact:true})).toBeVisible();
  await catalogue.getByRole('button',{name:'View Updated cotton shirt',exact:true}).click();await catalogue.getByRole('button',{name:'Edit product',exact:true}).click();await catalogue.getByLabel('Product active',{exact:true}).uncheck();await catalogue.getByRole('button',{name:'Save product',exact:true}).click();await expect(catalogue.getByRole('article',{name:'Product details'}).getByText('Inactive · COTTON-01',{exact:true})).toBeVisible();
  await catalogue.getByRole('button',{name:'Edit product',exact:true}).click();await catalogue.getByLabel('Product active',{exact:true}).check();await catalogue.getByRole('button',{name:'Save product',exact:true}).click();
  await catalogue.getByRole('button',{name:'Categories',exact:true}).click();await catalogue.getByRole('button',{name:'Edit Shirts',exact:true}).click();await catalogue.getByLabel('Category name').fill('Clothing');await catalogue.getByLabel('Category active',{exact:true}).uncheck();await catalogue.getByRole('button',{name:'Save category',exact:true}).click();await expect(catalogue.getByRole('button',{name:'Edit Clothing',exact:true})).toBeVisible();
  await catalogue.getByRole('button',{name:'Brands',exact:true}).click();await catalogue.getByRole('button',{name:'Edit House label',exact:true}).click();await catalogue.getByLabel('Brand active',{exact:true}).uncheck();await catalogue.getByRole('button',{name:'Save brand',exact:true}).click();
  const staffContext=await browser.newContext();try{const staff=await staffContext.newPage();await staff.goto('/');await staff.getByRole('button',{name:'Create owner account',exact:true}).click();await staff.getByLabel('Email address').fill(staffEmail);await staff.getByLabel('Password',{exact:true}).fill(password);await staff.getByRole('button',{name:'Create account',exact:true}).click();await expect(staff.getByRole('heading',{name:'Set up your business'})).toBeVisible();}finally{await staffContext.close();}
  await page.getByLabel('Staff email').fill(staffEmail);await page.getByLabel('Staff name').fill('Catalogue cashier');await page.getByLabel('Catalogue shop: all branches',{exact:true}).check();await page.getByRole('button',{name:'Save staff access',exact:true}).click();await expect(page.getByRole('button',{name:'Edit access for Catalogue cashier',exact:true})).toBeVisible();
  const cashierContext=await browser.newContext();try{
   const cashier=await cashierContext.newPage();await cashier.goto('/');await cashier.getByLabel('Email address').fill(staffEmail);await cashier.getByLabel('Password',{exact:true}).fill(password);await cashier.getByRole('button',{name:'Sign in',exact:true}).click();
   const readOnly=cashier.getByRole('region',{name:'Product catalogue',exact:true});await expect(readOnly.getByRole('button',{name:'View Updated cotton shirt',exact:true})).toBeVisible();await expect(readOnly.getByRole('button',{name:'Add product',exact:true})).toHaveCount(0);await expect(readOnly.getByRole('button',{name:'Categories',exact:true})).toHaveCount(0);
   await readOnly.getByRole('button',{name:'View Updated cotton shirt',exact:true}).click();await expect(readOnly.getByText('COTTON-S-RED',{exact:true})).toBeVisible();await expect(readOnly.getByText(/Cost ₹/)).toHaveCount(0);await expect(readOnly.getByRole('button',{name:'Edit product',exact:true})).toHaveCount(0);
  }finally{await cashierContext.close();}
 }finally{
  const db=new pg.Client({connectionString:url});await db.connect();
  try{
   const tenants=(await db.query('SELECT tenant_id FROM public.memberships WHERE identity_id IN (SELECT id FROM stich_auth.identity_accounts WHERE normalised_email=$1)',[email])).rows;
   for(const{tenant_id:tenant}of tenants){
    const images=(await db.query('SELECT id FROM public.product_images WHERE tenant_id=$1',[tenant])).rows;for(const image of images)await removeUncommittedImage(tenant,image.id).catch(()=>{});
    await db.query('BEGIN');await db.query('UPDATE public.products SET image_id=NULL WHERE tenant_id=$1',[tenant]);
    for(const table of ['stich_auth.catalogue_events','public.product_images','public.variant_barcodes','public.catalogue_prices','public.product_variants','public.product_shops','public.products','public.categories','public.brands','stich_auth.access_events','public.membership_sessions','public.membership_roles','public.membership_scopes','public.branches','public.shops','public.memberships','public.roles'])await db.query(`DELETE FROM ${table} WHERE tenant_id=$1`,[tenant]);await db.query('DELETE FROM public.tenants WHERE id=$1',[tenant]);await db.query('COMMIT');
   }
   for(const address of [email,staffEmail]){const identities=(await db.query('SELECT id FROM stich_auth.identity_accounts WHERE normalised_email=$1',[address])).rows;for(const{id}of identities){await db.query('DELETE FROM stich_auth.password_resets WHERE identity_id=$1',[id]);await db.query('DELETE FROM stich_auth.identity_sessions WHERE identity_id=$1',[id]);await db.query('DELETE FROM stich_auth.identity_accounts WHERE id=$1',[id]);}}
  }finally{await db.end();}
 }
});
