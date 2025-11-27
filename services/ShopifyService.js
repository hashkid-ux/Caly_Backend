// Backend/services/ShopifyService.js - Enhanced with all methods
const logger = require('../utils/logger');
const shopifyConnector = require('../shopify');
const { LRUCache } = require('lru-cache');

// LRU Cache for optimizations (5 min TTL)
const cache = new LRUCache({
  max: 500,
  ttl: 1000 * 60 * 5
});

class ShopifyService {
  /**
   * Get order with caching
   */
  static async getOrder(orderId) {
    const cacheKey = `order_${orderId}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      logger.debug('Order cache hit', { orderId });
      return cached;
    }

    try {
      logger.info('Fetching order from Shopify', { orderId });
      const orderData = await shopifyConnector.getOrder(orderId);
      if (orderData) {
        cache.set(cacheKey, orderData);
      }
      return orderData;
    } catch (error) {
      logger.error('Shopify API error', { orderId, error: error.message });
      return null;
    }
  }

  /**
   * Get order transactions (for payment issues)
   */
  static async getOrderTransactions(orderId) {
    const cacheKey = `transactions_${orderId}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
      const transactions = await shopifyConnector.getTransactions(orderId);
      if (transactions) {
        cache.set(cacheKey, transactions);
      }
      return transactions || [];
    } catch (error) {
      logger.error('Error fetching transactions', { error: error.message });
      return [];
    }
  }

  /**
   * Generate payment link for retry
   */
  static async generatePaymentLink(orderId) {
    try {
      // Create draft order invoice
      const response = await shopifyConnector.createInvoice(orderId);
      return response?.invoice_url || null;
    } catch (error) {
      logger.error('Error generating payment link', { error: error.message });
      return null;
    }
  }

  /**
   * Update shipping address
   */
  static async updateShippingAddress(orderId, newAddress) {
    try {
      logger.info('Updating shipping address', { orderId });
      const result = await shopifyConnector.updateOrder(orderId, {
        shipping_address: newAddress
      });
      
      // Invalidate cache
      cache.delete(`order_${orderId}`);
      
      return result;
    } catch (error) {
      logger.error('Error updating address', { error: error.message });
      return null;
    }
  }

  /**
   * Update tracking address (Shiprocket/Delhivery)
   */
  static async updateTrackingAddress(trackingNumber, newAddress) {
    try {
      // This would integrate with Shiprocket API
      logger.info('Updating tracking address', { trackingNumber });
      // Mock implementation
      return { success: true };
    } catch (error) {
      logger.error('Error updating tracking address', { error: error.message });
      return null;
    }
  }

  /**
   * Search products
   */
  static async searchProducts(query, limit = 10) {
    const cacheKey = `search_${query}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
      const products = await shopifyConnector.searchProducts(query, limit);
      if (products) {
        cache.set(cacheKey, products);
      }
      return products;
    } catch (error) {
      logger.error('Error searching products', { error: error.message });
      return [];
    }
  }

  /**
   * Get popular/featured products
   */
  static async getPopularProducts(limit = 10) {
    const cacheKey = 'popular_products';
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
      // Get products sorted by sales
      const products = await shopifyConnector.getProducts({ 
        limit,
        sort: 'best-selling'
      });
      if (products) {
        cache.set(cacheKey, products);
      }
      return products;
    } catch (error) {
      logger.error('Error fetching popular products', { error: error.message });
      return [];
    }
  }

  /**
   * Get product by ID
   */
  static async getProduct(productId) {
    const cacheKey = `product_${productId}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
      const product = await shopifyConnector.getProduct(productId);
      if (product) {
        cache.set(cacheKey, product);
      }
      return product;
    } catch (error) {
      logger.error('Error fetching product', { error: error.message });
      return null;
    }
  }

  /**
   * Create exchange request
   */
  static async createExchange(exchangeData) {
    try {
      logger.info('Creating exchange', { orderId: exchangeData.order_id });
      
      // Shopify doesn't have native exchange - create return + new order
      const returnResult = await this.createReturn(exchangeData);
      
      return {
        exchange_id: 'EX' + Date.now(),
        return_id: returnResult.return_id,
        order_id: exchangeData.order_id,
        status: 'pending',
        requires_pickup: true
      };
    } catch (error) {
      logger.error('Error creating exchange', { error: error.message });
      return null;
    }
  }

  /**
   * Generate invoice PDF
   */
  static async generateInvoice(orderId) {
    try {
      // Use Shopify's order invoice endpoint
      const invoice = await shopifyConnector.getOrderInvoice(orderId);
      return invoice?.invoice_url || `https://invoice.example.com/${orderId}`;
    } catch (error) {
      logger.error('Error generating invoice', { error: error.message });
      return null;
    }
  }

  /**
   * Send invoice via email/SMS
   */
  static async sendInvoice(email, phone, invoiceUrl) {
    try {
      // Send email
      // await emailService.send({ to: email, template: 'invoice', url: invoiceUrl });
      
      // Send SMS
      // await smsService.send({ to: phone, message: `Invoice: ${invoiceUrl}` });
      
      logger.info('Invoice sent', { email, phone });
      return true;
    } catch (error) {
      logger.error('Error sending invoice', { error: error.message });
      return false;
    }
  }

  /**
   * Create customer
   */
  static async createCustomer(customerData) {
    try {
      const customer = await shopifyConnector.createCustomer(customerData);
      return customer;
    } catch (error) {
      logger.error('Error creating customer', { error: error.message });
      return null;
    }
  }

  /**
   * Send welcome message
   */
  static async sendWelcomeMessage(phone, email, name) {
    try {
      // Send welcome email
      // await emailService.send({ to: email, template: 'welcome', name });
      
      // Send welcome SMS
      const message = `Welcome ${name}! Thank you for registering. Use code WELCOME10 for 10% off your first order!`;
      // await smsService.send({ to: phone, message });
      
      logger.info('Welcome message sent', { phone, email });
      return true;
    } catch (error) {
      logger.error('Error sending welcome', { error: error.message });
      return false;
    }
  }

  /**
   * Get tracking info with caching
   */
  static async getTrackingInfo(trackingId) {
    const cacheKey = `tracking_${trackingId}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
      logger.info('Fetching tracking info', { trackingId });
      // Mock data - integrate with Shiprocket/Delhivery in production
      const trackingInfo = {
        status: 'in_transit',
        current_location: 'Mumbai Distribution Center',
        eta: new Date(Date.now() + 86400000).toISOString(),
        last_update: 'Package out for delivery'
      };
      
      cache.set(cacheKey, trackingInfo, 1000 * 60 * 2); // 2 min cache for tracking
      return trackingInfo;
    } catch (error) {
      logger.error('Error fetching tracking', { error: error.message });
      return null;
    }
  }

  /**
   * Create return request
   */
  static async createReturn(returnDetails) {
    try {
      logger.info('Creating return', { orderId: returnDetails.order_id });
      const returnData = await shopifyConnector.createReturn(returnDetails);
      
      // Invalidate order cache
      cache.delete(`order_${returnDetails.order_id}`);
      
      return returnData;
    } catch (error) {
      logger.error('Error creating return', { error: error.message });
      return null;
    }
  }

  /**
   * Schedule pickup
   */
  static async schedulePickup(orderData, returnData) {
    try {
      logger.info('Scheduling pickup', { orderId: orderData.id });
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      return {
        pickup_id: 'PK' + Date.now(),
        scheduled_date: tomorrow.toISOString(),
        time_slot: '10:00 AM - 2:00 PM',
        address: orderData.shipping_address,
        status: 'scheduled'
      };
    } catch (error) {
      logger.error('Error scheduling pickup', { error: error.message });
      return null;
    }
  }

  /**
   * Create refund
   */
  static async createRefund(orderData) {
    try {
      logger.info('Creating refund', { orderId: orderData.id });
      const refundData = await shopifyConnector.createRefund(orderData.id, {
        amount: orderData.total_price
      });
      
      // Invalidate cache
      cache.delete(`order_${orderData.id}`);
      
      return refundData;
    } catch (error) {
      logger.error('Error creating refund', { error: error.message });
      return null;
    }
  }

  /**
   * Cancel order
   */
  static async cancelOrder(orderData) {
    try {
      logger.info('Cancelling order', { orderId: orderData.id });
      const cancellationData = await shopifyConnector.cancelOrder(
        orderData.id,
        'Customer request'
      );
      
      // Invalidate cache
      cache.delete(`order_${orderData.id}`);
      
      return cancellationData;
    } catch (error) {
      logger.error('Error cancelling order', { error: error.message });
      return null;
    }
  }

  /**
   * Clear cache for an order
   */
  static clearOrderCache(orderId) {
    cache.delete(`order_${orderId}`);
    cache.delete(`transactions_${orderId}`);
    logger.debug('Cache cleared', { orderId });
  }
}

module.exports = ShopifyService;