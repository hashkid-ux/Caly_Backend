// backend/shopify.js - Shopify Admin API integration
const axios = require('axios');
const logger = require('./utils/logger');

class ShopifyConnector {
  constructor() {
    this.storeUrl = process.env.SHOPIFY_STORE_URL;
    this.accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
    this.apiVersion = process.env.SHOPIFY_API_VERSION || '2025-01';
    
    this.client = axios.create({
      baseURL: `https://${this.storeUrl}/admin/api/${this.apiVersion}`,
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
  }

  /**
   * Get order by order number or ID
   * @param {string} orderIdentifier - Order number or ID
   */
  async getOrder(orderIdentifier) {
    try {
      logger.debug('Fetching order from Shopify', { orderIdentifier });

      // Try by order number first
      const response = await this.client.get('/orders.json', {
        params: {
          name: orderIdentifier,
          status: 'any',
          limit: 1
        }
      });

      if (response.data.orders && response.data.orders.length > 0) {
        return response.data.orders[0];
      }

      // Try by order ID
      try {
        const orderResponse = await this.client.get(`/orders/${orderIdentifier}.json`);
        return orderResponse.data.order;
      } catch (error) {
        logger.warn('Order not found by ID', { orderIdentifier });
      }

      return null;

    } catch (error) {
      logger.error('Error fetching order from Shopify', {
        orderIdentifier,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create return request
   * @param {object} returnData - Return request data
   */
  async createReturn(returnData) {
    try {
      logger.info('Creating return in Shopify', { 
        orderId: returnData.order_id 
      });

      // Shopify doesn't have native return API
      // Create a draft order or use custom return app
      // For now, create a note on the order

      await this.client.post(`/orders/${returnData.order_id}/metafields.json`, {
        metafield: {
          namespace: 'returns',
          key: 'return_request',
          value: JSON.stringify({
            ...returnData,
            created_at: new Date().toISOString(),
            status: 'pending'
          }),
          type: 'json'
        }
      });

      return {
        return_id: 'RET' + Date.now(),
        order_id: returnData.order_id,
        status: 'pending',
        created_at: new Date().toISOString(),
        requires_pickup: true
      };

    } catch (error) {
      logger.error('Error creating return', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Cancel order
   * @param {string} orderId - Order ID
   * @param {string} reason - Cancellation reason
   */
  async cancelOrder(orderId, reason = 'Customer request') {
    try {
      logger.info('Cancelling order in Shopify', { orderId });

      const response = await this.client.post(`/orders/${orderId}/cancel.json`, {
        reason: reason
      });

      return response.data.order;

    } catch (error) {
      logger.error('Error cancelling order', {
        orderId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get refund status
   * @param {string} orderId - Order ID
   */
  async getRefunds(orderId) {
    try {
      const response = await this.client.get(`/orders/${orderId}/refunds.json`);
      return response.data.refunds;
    } catch (error) {
      logger.error('Error fetching refunds', {
        orderId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create refund
   * @param {string} orderId - Order ID
   * @param {object} refundData - Refund details
   */
  async createRefund(orderId, refundData) {
    try {
      logger.info('Creating refund in Shopify', { orderId });

      const response = await this.client.post(`/orders/${orderId}/refunds.json`, {
        refund: refundData
      });

      return response.data.refund;

    } catch (error) {
      logger.error('Error creating refund', {
        orderId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get product details
   * @param {string} productId - Product ID
   */
  async getProduct(productId) {
    try {
      const response = await this.client.get(`/products/${productId}.json`);
      return response.data.product;
    } catch (error) {
      logger.error('Error fetching product', {
        productId,
        error: error.message
      });
      throw error;
    }
  }
}

// Singleton instance
const shopifyConnector = new ShopifyConnector();

module.exports = shopifyConnector;