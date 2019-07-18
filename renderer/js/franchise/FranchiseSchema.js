const fs = require('fs');
const path = require('path');
const XmlStream = require('xml-stream');
const schemaFilePath = '../../../data/schemas.xml';
const EventEmitter = require('events').EventEmitter;
const utilService = require('../services/utilService');

class FranchiseSchema extends EventEmitter {
  constructor () {
    super();

    this.schemas = [];
    const stream = fs.createReadStream(path.join(__dirname, schemaFilePath));
    this.xml = new XmlStream(stream);

    this.xml.collect('attribute');

    const that = this;
    this.xml.on('endElement: schema', function (schema) {
      let attributes = [];
      
      if (schema.attribute) {
        attributes = schema.attribute.map((attribute) => {
          return {
            'index': attribute.$.idx,
            'name': attribute.$.name,
            'type': attribute.$.type,
            'minValue': attribute.$.minValue,
            'maxValue': attribute.$.maxValue,
            'maxLength': attribute.$.maxLen,
            'default': attribute.$.default,
            'final': attribute.$.final
          }
        });
      }

      const element = {
        'assetId': schema.$.assetId,
        'ownerAssetId': schema.$.ownerAssetId,
        'numMembers': schema.$.numMembers,
        'name': schema.$.name,
        'base': schema.$.base,
        'attributes': attributes
      };

      that.schemas.push(element);

      if (element.name === 'WinLossStreakPlayerGoal') {
        calculateInheritedSchemas();
        that.emit('done', that.schemas);
      }
    });

    function calculateInheritedSchemas() {
      const schemasWithBase = that.schemas.filter((schema) => { return schema.base && schema.base.indexOf("()") === -1; });
      schemasWithBase.forEach((schema) => {
        schema.originalAttributesOrder = schema.attributes;
        const baseSchema = that.schemas.find((schemaToSearch) => { return schemaToSearch.name === schema.base; });

        if (baseSchema) {
          baseSchema.attributes.forEach((baseAttribute, index) => {
            let oldIndex = schema.attributes.findIndex((schemaAttribute) => { return schemaAttribute.name === baseAttribute.name; });
            utilService.arrayMove(schema.attributes, oldIndex, index);
          });
        }
      })
    };
  };

  getSchema(name) {
    return this.schemas.find((schema) => { return schema.name === name; });
  };
};

module.exports = FranchiseSchema;