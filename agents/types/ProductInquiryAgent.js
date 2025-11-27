// Backend/agents/types/ProductInquiryAgent.js
const BaseAgent = require('../BaseAgent');
const logger = require('../../utils/logger');
const db = require('../../db/postgres');
const ShopifyService = require('../../services/ShopifyService');

class ProductInquiryAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = []; // Can work without specific fields
    this.agentType = 'ProductInquiryAgent';
  }

  async execute() {
    try {
      this.state = 'RUNNING';
      logger.info('Executing product inquiry', { 
        callId: this.callId,
        query: this.data.query,
        productId: this.data.product_id 
      });

      const action = await db.actions.create({
        call_id: this.callId,
        action_type: 'product_inquiry',
        params: { 
          query: this.data.query,
          product_id: this.data.product_id,
          category: this.data.category
        },
        confidence: 0.85
      });

      let results;

      // Specific product lookup
      if (this.data.product_id) {
        const product = await ShopifyService.getProduct(this.data.product_id);
        
        if (!product) {
          await db.actions.updateStatus(action.id, 'failed', { 
            error: 'Product not found' 
          });
          this.complete({
            success: false,
            message: 'Product not found',
            contextUpdate: 'Product not found. Ask if customer wants to search for something else.'
          });
          return;
        }

        results = {
          type: 'single_product',
          product: this.formatProductDetails(product)
        };
      }
      // Search query
      else if (this.data.query) {
        const products = await ShopifyService.searchProducts(
          this.data.query, 
          5 // Top 5 results
        );

        if (!products || products.length === 0) {
          await db.actions.updateStatus(action.id, 'success', { 
            found: false 
          });
          this.complete({
            success: true,
            results: [],
            contextUpdate: `No products found for "${this.data.query}". Suggest customer to try different search terms or ask about popular products. Say in Hindi: "Sir, yeh product abhi stock mein nahi hai. Kuch aur dekhna chahenge?"`,
          });
          return;
        }

        results = {
          type: 'search_results',
          products: products.map(p => this.formatProductDetails(p)),
          count: products.length
        };
      }
      // Popular/featured products
      else {
        const products = await ShopifyService.getPopularProducts(5);

        results = {
          type: 'popular_products',
          products: products.map(p => this.formatProductDetails(p)),
          count: products.length
        };
      }

      await db.actions.updateStatus(action.id, 'success', { results });

      this.complete({
        success: true,
        results,
        contextUpdate: this.formatContextUpdate(results)
      });

    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Format product details for context
   */
  formatProductDetails(product) {
    return {
      id: product.id,
      title: product.title,
      price: product.variants?.[0]?.price || 'N/A',
      available: product.variants?.[0]?.inventory_quantity > 0,
      description: product.body_html?.substring(0, 200) || '',
      image: product.image?.src || '',
      variants: product.variants?.length || 0,
      tags: product.tags || []
    };
  }

  /**
   * Format context update for AI
   */
  formatContextUpdate(results) {
    let context = '';

    if (results.type === 'single_product') {
      const p = results.product;
      context = `Product Details:\n`;
      context += `- Name: ${p.title}\n`;
      context += `- Price: ₹${p.price}\n`;
      context += `- Availability: ${p.available ? 'In Stock' : 'Out of Stock'}\n`;
      
      if (p.variants > 1) {
        context += `- Available in ${p.variants} variants (size/color options)\n`;
      }
      
      if (p.description) {
        context += `- Description: ${p.description}\n`;
      }
      
      context += `\nTell customer about this product in natural Hindi. Mention price, availability, and key features. Ask if they want to order or see more options.`;
    }
    else if (results.type === 'search_results') {
      context = `Found ${results.count} products:\n\n`;
      
      results.products.forEach((p, idx) => {
        context += `${idx + 1}. ${p.title}\n`;
        context += `   - Price: ₹${p.price}\n`;
        context += `   - ${p.available ? 'Available' : 'Out of Stock'}\n\n`;
      });
      
      context += `Tell customer about these products in Hindi. Mention top 2-3 options with prices. Ask which one they're interested in or if they want more details about any specific product.`;
    }
    else {
      context = `Our Popular Products:\n\n`;
      
      results.products.slice(0, 3).forEach((p, idx) => {
        context += `${idx + 1}. ${p.title} - ₹${p.price}\n`;
      });
      
      context += `\nShare these popular items with customer in Hindi. These are best-selling products. Ask which category they're interested in.`;
    }

    return context;
  }

  /**
   * Check stock availability
   */
  async checkStock(productId) {
    try {
      const product = await ShopifyService.getProduct(productId);
      
      if (!product) {
        return { available: false, quantity: 0 };
      }

      const totalStock = product.variants.reduce((sum, variant) => {
        return sum + (variant.inventory_quantity || 0);
      }, 0);

      return {
        available: totalStock > 0,
        quantity: totalStock,
        variants: product.variants.map(v => ({
          id: v.id,
          title: v.title,
          price: v.price,
          available: v.inventory_quantity > 0
        }))
      };
    } catch (error) {
      logger.error('Error checking stock', { error: error.message });
      return { available: false, quantity: 0 };
    }
  }

  getPromptForField(field) {
    if (field === 'query') {
      return 'Ask user: "Ji sir, aap kaunsa product dekhna chahenge? Kuch specific batayiye"';
    }
    return super.getPromptForField(field);
  }
}

module.exports = ProductInquiryAgent;