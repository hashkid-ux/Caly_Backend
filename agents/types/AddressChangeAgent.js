// Backend/agents/types/AddressChangeAgent.js
const BaseAgent = require('../BaseAgent');
const logger = require('../../utils/logger');
const db = require('../../db/postgres');
const ShopifyService = require('../../services/ShopifyService');

class AddressChangeAgent extends BaseAgent {
  constructor(callId, initialData = {}) {
    super(callId, initialData);
    this.requiredFields = ['order_id', 'new_address'];
    this.agentType = 'AddressChangeAgent';
  }

  async execute() {
    try {
      if (!this.hasRequiredData()) {
        this.state = 'WAITING_FOR_INFO';
        this.requestMissingInfo();
        return;
      }

      this.state = 'RUNNING';
      logger.info('Executing address change', { 
        callId: this.callId,
        orderId: this.data.order_id 
      });

      const action = await db.actions.create({
        call_id: this.callId,
        action_type: 'change_address',
        params: { 
          order_id: this.data.order_id,
          new_address: this.data.new_address,
          pin_code: this.data.pin_code
        },
        confidence: 0.9
      });

      const orderData = await ShopifyService.getOrder(this.data.order_id);

      if (!orderData) {
        await db.actions.updateStatus(action.id, 'failed', { error: 'Order not found' });
        this.complete({
          success: false,
          message: 'Order not found',
          contextUpdate: 'Order not found. Cannot change address.'
        });
        return;
      }

      // Check if address can be changed
      const eligibility = this.checkChangeEligibility(orderData);
      
      if (!eligibility.eligible) {
        await db.actions.updateStatus(action.id, 'failed', { error: eligibility.reason });
        this.complete({
          success: false,
          message: eligibility.reason,
          contextUpdate: `Cannot change address: ${eligibility.reason}. Suggest customer to refuse delivery and place new order.`
        });
        return;
      }

      // Parse new address
      const parsedAddress = this.parseAddress(this.data.new_address, this.data.pin_code);

      // Update address in Shopify
      const updateResult = await ShopifyService.updateShippingAddress(
        orderData.id,
        parsedAddress
      );

      if (!updateResult) {
        throw new Error('Failed to update address in Shopify');
      }

      // Update tracking system (Shiprocket/Delhivery)
      if (orderData.tracking_number) {
        await ShopifyService.updateTrackingAddress(
          orderData.tracking_number,
          parsedAddress
        );
      }

      await db.actions.updateStatus(action.id, 'success', { 
        old_address: orderData.shipping_address,
        new_address: parsedAddress 
      });

      this.complete({
        success: true,
        oldAddress: orderData.shipping_address,
        newAddress: parsedAddress,
        contextUpdate: this.formatAddressUpdate(orderData.shipping_address, parsedAddress)
      });

    } catch (error) {
      this.handleError(error);
    }
  }

  checkChangeEligibility(orderData) {
    // Cannot change if already shipped/delivered
    if (orderData.fulfillment_status === 'fulfilled') {
      return {
        eligible: false,
        reason: 'Order already delivered'
      };
    }

    // Cannot change if shipped
    if (orderData.fulfillment_status === 'partial' || 
        orderData.fulfillments?.some(f => f.status === 'success')) {
      return {
        eligible: false,
        reason: 'Order already shipped. Address cannot be changed.'
      };
    }

    // Cannot change if cancelled
    if (orderData.cancelled_at) {
      return {
        eligible: false,
        reason: 'Order already cancelled'
      };
    }

    // Check if order is too old (24 hours window)
    const orderDate = new Date(orderData.created_at);
    const now = new Date();
    const hoursSinceOrder = (now - orderDate) / (1000 * 60 * 60);
    
    if (hoursSinceOrder > 24) {
      return {
        eligible: false,
        reason: 'Address change window expired (24 hours from order)'
      };
    }

    return {
      eligible: true,
      reason: 'Address can be changed'
    };
  }

  parseAddress(addressText, pinCode) {
    // Parse address from natural language
    // This is a simple parser - can be enhanced with NLP
    
    const lines = addressText.split(/[,\n]/).map(l => l.trim()).filter(Boolean);
    
    return {
      address1: lines[0] || '',
      address2: lines[1] || '',
      city: this.extractCity(lines),
      province: this.extractState(lines),
      country: 'India',
      zip: pinCode || this.extractPinCode(addressText),
      phone: this.data.phone || ''
    };
  }

  extractCity(lines) {
    // Look for city in address lines
    const cityKeywords = ['mumbai', 'delhi', 'bangalore', 'chennai', 'kolkata', 'hyderabad', 'pune', 'ahmedabad'];
    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      for (const city of cityKeywords) {
        if (lowerLine.includes(city)) {
          return line;
        }
      }
    }
    return lines.length > 1 ? lines[lines.length - 2] : '';
  }

  extractState(lines) {
    // Extract state from address
    const stateKeywords = {
      'maharashtra': 'Maharashtra',
      'delhi': 'Delhi',
      'karnataka': 'Karnataka',
      'tamil nadu': 'Tamil Nadu',
      'west bengal': 'West Bengal',
      'telangana': 'Telangana'
    };
    
    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      for (const [keyword, state] of Object.entries(stateKeywords)) {
        if (lowerLine.includes(keyword)) {
          return state;
        }
      }
    }
    return '';
  }

  extractPinCode(text) {
    const match = text.match(/\b\d{6}\b/);
    return match ? match[0] : '';
  }

  formatAddressUpdate(oldAddress, newAddress) {
    let context = `Address Updated Successfully!\n\n`;
    context += `Old Address:\n${this.formatAddressForDisplay(oldAddress)}\n\n`;
    context += `New Address:\n${this.formatAddressForDisplay(newAddress)}\n\n`;
    context += `Delivery will now be made to the new address.\n`;
    context += `Tell customer in natural Hindi. Confirm the new address is correct.`;
    return context;
  }

  formatAddressForDisplay(address) {
    return `${address.address1}${address.address2 ? ', ' + address.address2 : ''}, ${address.city}, ${address.province} - ${address.zip}`;
  }

  getPromptForField(field) {
    if (field === 'order_id') {
      return 'Ask user: "Ji sir, address change ke liye apna order number batayiye"';
    }
    if (field === 'new_address') {
      return 'Ask user: "Ji sir, naya address batayiye please - ghar ka number, society/building, area aur pin code"';
    }
    if (field === 'pin_code') {
      return 'Ask user: "Ji sir, pin code batayiye please"';
    }
    return super.getPromptForField(field);
  }
}

module.exports = AddressChangeAgent;