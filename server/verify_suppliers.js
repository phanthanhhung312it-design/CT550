require('dotenv').config();
const mongoose = require('mongoose');
const { connectDb } = require('./config/db');

(async () => {
  await connectDb();

  const suppliers = await mongoose.connection.collection('nhacungcap').find({}).toArray();
  const allProducts = await mongoose.connection.collection('products').find({}).toArray();
  const productsWithSupplier = allProducts.filter((p) => p.ncc_ma);

  console.log('=== NHÂN CUNG CẤP ===');
  console.log(`Tổng nhà cung cấp: ${suppliers.length}`);
  suppliers.forEach((s) => {
    console.log(`  ${s.ncc_ma}. ${s.ncc_ten} (${s.ncc_diachi})`);
  });

  console.log('\n=== SẢN PHẨM ===');
  console.log(`Tổng sản phẩm trong DB: ${allProducts.length}`);
  console.log(`Sản phẩm có nhà cung cấp (ncc_ma): ${productsWithSupplier.length}`);

  if (productsWithSupplier.length > 0) {
    console.log('\nChi tiết sản phẩm:');
    productsWithSupplier.forEach((p) => {
      const supplier = suppliers.find((s) => s.ncc_ma === p.ncc_ma);
      console.log(`  ${p.id}. ${p.name || p.sp_ten} → NCC ${p.ncc_ma} (${supplier?.ncc_ten || 'N/A'})`);
    });
  } else {
    console.log('\nSample sản phẩm đầu tiên:');
    if (allProducts.length > 0) {
      const sample = allProducts[0];
      console.log(`  ID: ${sample.id}`);
      console.log(`  Name: ${sample.name}`);
      console.log(`  Fields:`, Object.keys(sample).slice(0, 10).join(', '));
      console.log(`  ncc_ma: ${sample.ncc_ma}`);
    }
  }

  await mongoose.connection.close();
  process.exit(0);
})().catch((error) => {
  console.error('Lỗi:', error.message);
  process.exit(1);
});

