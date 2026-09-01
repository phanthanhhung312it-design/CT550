import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './App.css';
import SiteLayout from './view/SiteLayout';
import ScrollToTop from './view/ScrollToTop';
import Home from './view/Home';
import Catalog from './view/Catalog';
import BestSells from './view/BestSells';
import FlashSale from './view/FlashSale';
import Blog from './view/Blog';
import BlogDetail from './view/BlogDetail';
import Login from './view/Login';
import Register from './view/Register';
import Account from './view/Account';
import Cart from './view/Cart';
import Checkout from './view/Checkout';
import ProductDetail from './view/ProductDetail';
import NewArrivals from './view/NewArrivals';
import Orders from './view/Orders';
import Rental from './view/Rental';
import Admin from './view/Admin';
import BlogManager from './view/BlogManager';
import Support from './view/Support';
import NotFound from './view/NotFound';

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route path="admin" element={<Admin />} />
        <Route path="blog-manager" element={<BlogManager />} />
        <Route element={<SiteLayout />}>
          <Route index element={<Home />} />
          <Route path="catalog" element={<Catalog />} />
          <Route path="flash-sale" element={<FlashSale />} />
          <Route path="best-sells" element={<BestSells />} />
          <Route path="blog" element={<Blog />} />
          <Route path="blog/:slug" element={<BlogDetail />} />
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
          <Route path="account" element={<Account />} />
          <Route path="cart" element={<Cart />} />
          <Route path="checkout" element={<Checkout />} />
          <Route path="product/:id" element={<ProductDetail />} />
          <Route path="new-arrivals" element={<NewArrivals />} />
          <Route path="rentals" element={<Rental />} />
          <Route path="orders" element={<Orders />} />
          <Route path="support" element={<Support />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
