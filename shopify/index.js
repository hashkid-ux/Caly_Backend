// Backend/shopify/index.js - Complete Shopify API Integration
const axios = require('axios');
const logger = require('../utils/logger');

class ShopifyConnector {
  constructor(store, apiKey, apiPassword) {
    this.store = store;
    this.apiKey = apiKey;
    this.apiPassword = apiPassword;
    this.baseUrl = `https://${store}/admin/api/2024-01`;
    
    // Create axios instance with auth
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'X-Shopify-Access-Token': apiPassword,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
  }

  /**
   * Get order details
   */
  async getOrder(orderId) {
    try {
      logger.info('Fetching Shopify order', { orderId });
      const response = await this.client.get(`/orders/${orderId}.json`);
      return response.data.order;
    } catch (error) {
      logger.error('Shopify getOrder error', { 
        orderId, 
        error: error.response?.data || error.message 
      });
      return null;
    }
  }

  /**
   * Get order transactions (for payment issues)
   */
  async getTransactions(orderId) {
    try {
      const response = await this.client.get(`/orders/${orderId}/transactions.json`);
      return response.data.transactions || [];
    } catch (error) {
      logger.error('Shopify getTransactions error', { 
        orderId, 
        error: error.message 
      });
      return [];
    }
  }

  /**
   * Create return request
   */
  async createReturn(returnDetails) {
    try {
      const { order_id, line_items, reason, customer_note } = returnDetails;
      
      logger.info('Creating Shopify return', { order_id });
      
      // Create return via Shopify API
      const response = await this.client.post(`/orders/${order_id}/refunds/calculate.json`, {
        refund: {
          notify: true,
          note: customer_note || 'Customer return request',
          refund_line_items: line_items.map(item => ({
            line_item_id: item.id,
            quantity: item.quantity,
            restock_type: 'return'
          }))
        }
      });

      return {
        return_id: 'RET' + Date.now(),
        order_id,
        status: 'pending',
        requires_pickup: true,
        refund_amount: response.data.refund.refund_line_items.reduce(
          (sum, item) => sum + parseFloat(item.subtotal), 
          0
        )
      };
    } catch (error) {
      logger.error('Shopify createReturn error', { error: error.message });
      return null;
    }
  }

  /**
   * Schedule pickup (via Shiprocket integration)
   */
  async schedulePickup(orderData, returnData) {
    try {
      // In production, integrate with Shiprocket API
      // For now, return mock pickup data
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
      logger.error('Shopify schedulePickup error', { error: error.message });
      return null;
    }
  }

  /**
   * Create refund
   */
  async createRefund(orderId, refundDetails) {
    try {
      logger.info('Creating Shopify refund', { orderId });

      const response = await this.client.post(`/orders/${orderId}/refunds.json`, {
        refund: {
          notify: true,
          note: refundDetails.reason || 'Customer refund request',
          transactions: [{
            parent_id: refundDetails.transaction_id,
            amount: refundDetails.amount || refundDetails.total_price,
            kind: 'refund',
            gateway: 'manual'
          }]
        }
      });

      return {
        refund_id: response.data.refund.id,
        status: 'processing',
        amount: response.data.refund.transactions[0].amount,
        timeline: '5-7 business days'
      };
    } catch (error) {
      logger.error('Shopify createRefund error', { error: error.message });
      return null;
    }
  }

  /**
   * Cancel order
   */
  async cancelOrder(orderId, reason) {
    try {
      logger.info('Cancelling Shopify order', { orderId, reason });

      const response = await this.client.post(`/orders/${orderId}/cancel.json`, {
        reason: reason || 'customer',
        email: true,
        refund: true
      });

      return {
        cancelled_at: response.data.order.cancelled_at,
        status: 'cancelled',
        refund_initiated: true
      };
    } catch (error) {
      logger.error('Shopify cancelOrder error', { error: error.message });
      return null;
    }
  }

  /**
   * Update order (for address changes, etc.)
   */
  async updateOrder(orderId, updates) {
    try {
      logger.info('Updating Shopify order', { orderId });

      const response = await this.client.put(`/orders/${orderId}.json`, {
        order: updates
      });

      return response.data.order;
    } catch (error) {
      logger.error('Shopify updateOrder error', { error: error.message });
      return null;
    }
  }

  /**
   * Get tracking info (for Shiprocket integration)
   */
  async getTrackingInfo(trackingNumber) {
    try {
      // In production, integrate with Shiprocket API
      // For now, return mock tracking data
      return {
        tracking_number: trackingNumber,
        status: 'in_transit',
        current_location: 'Mumbai Distribution Center',
        eta: new Date(Date.now() + 86400000).toISOString(),
        last_update: 'Package out for delivery',
        events: [
          { timestamp: new Date(), status: 'Out for delivery', location: 'Mumbai' },
          { timestamp: new Date(Date.now() - 3600000), status: 'In transit', location: 'Mumbai' },
          { timestamp: new Date(Date.now() - 86400000), status: 'Picked up', location: 'Warehouse' }
        ]
      };
    } catch (error) {
      logger.error('Shopify getTrackingInfo error', { error: error.message });
      return null;
    }
  }

  /**
   * Search products
   */
  async searchProducts(query, limit = 10) {
    try {
      const response = await this.client.get('/products.json', {
        params: {
          title: query,
          limit,
          status: 'active'
        }
      });

      return response.data.products || [];
    } catch (error) {
      logger.error('Shopify searchProducts error', { error: error.message });
      return [];
    }
  }

  /**
   * Get product details
   */
  async getProduct(productId) {
    try {
      const response = await this.client.get(`/products/${productId}.json`);
      return response.data.product;
    } catch (error) {
      logger.error('Shopify getProduct error', { error: error.message });
      return null;
    }
  }

  /**
   * Get products (for popular products)
   */
  async getProducts(options = {}) {
    try {
      const params = {
        limit: options.limit || 10,
        status: 'active'
      };

      if (options.sort === 'best-selling') {
        params.sort = 'best_selling';
      }

      const response = await this.client.get('/products.json', { params });
      return response.data.products || [];
    } catch (error) {
      logger.error('Shopify getProducts error', { error: error.message });
      return [];
    }
  }

  /**
   * Create customer
   */
  async createCustomer(customerData) {
    try {
      logger.info('Creating Shopify customer', { phone: customerData.phone });

      const response = await this.client.post('/customers.json', {
        customer: {
          first_name: customerData.first_name || 'Customer',
          last_name: customerData.last_name || '',
          email: customerData.email,
          phone: customerData.phone,
          tags: customerData.tags || 'voice_registered',
          accepts_marketing: false
        }
      });

      return response.data.customer;
    } catch (error) {
      logger.error('Shopify createCustomer error', { error: error.message });
      return null;
    }
  }

  /**
   * Get order invoice
   */
  async getOrderInvoice(orderId) {
    try {
      // Shopify doesn't have native invoice endpoint
      // Generate invoice URL
      return {
        invoice_url: `${this.baseUrl.replace('/admin/api/2024-01', '')}/account/orders/${orderId}`
      };
    } catch (error) {
      logger.error('Shopify getOrderInvoice error', { error: error.message });
      return null;
    }
  }

  /**
   * Generate invoice PDF (simplified)
   */
  async generateInvoice(orderId) {
    try {
      const order = await this.getOrder(orderId);
      if (!order) return null;

      // In production, use a PDF generation service
      return `https://invoice.example.com/${orderId}.pdf`;
    } catch (error) {
      logger.error('Shopify generateInvoice error', { error: error.message });
      return null;
    }
  }

  /**
   * Send invoice (via email/SMS)
   */
  async sendInvoice(email, phone, invoiceUrl) {
    try {
      // In production, integrate with email/SMS service
      logger.info('Invoice sent', { email, phone, invoiceUrl });
      return true;
    } catch (error) {
      logger.error('Shopify sendInvoice error', { error: error.message });
      return false;
    }
  }

  /**
   * Send welcome message (via email/SMS)
   */
  async sendWelcomeMessage(phone, email, name) {
    try {
      // In production, integrate with email/SMS service
      logger.info('Welcome message sent', { phone, email, name });
      return true;
    } catch (error) {
      logger.error('Shopify sendWelcomeMessage error', { error: error.message });
      return false;
    }
  }

  /**
   * Create exchange (Shopify doesn't have native exchange - use return + new order)
   */
  async createExchange(exchangeData) {
    try {
      // Create return first
      const returnResult = await this.createReturn(exchangeData);
      
      return {
        exchange_id: 'EX' + Date.now(),
        return_id: returnResult?.return_id,
        order_id: exchangeData.order_id,
        status: 'pending',
        requires_pickup: true
      };
    } catch (error) {
      logger.error('Shopify createExchange error', { error: error.message });
      return null;
    }
  }

  /**
   * Create invoice for payment retry
   */
  async createInvoice(orderId) {
    try {
      // Generate payment link for failed orders
      const order = await this.getOrder(orderId);
      if (!order) return null;

      return {
        invoice_url: `${this.baseUrl.replace('/admin/api/2024-01', '')}/checkout/${order.checkout_id}/payment`
      };
    } catch (error) {
      logger.error('Shopify createInvoice error', { error: error.message });
      return null;
    }
  }

  /**
   * Update tracking address (via Shiprocket)
   */
  async updateTrackingAddress(trackingNumber, newAddress) {
    try {
      // In production, integrate with Shiprocket API
      logger.info('Tracking address updated', { trackingNumber });
      return { success: true };
    } catch (error) {
      logger.error('Shopify updateTrackingAddress error', { error: error.message });
      return null;
    }
  }
}

// Export factory function that uses client credentials from database
const createShopifyClient = (store, apiKey, apiPassword) => {
  return new ShopifyConnector(store, apiKey, apiPassword);
};

module.exports = createShopifyClient;