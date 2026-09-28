/* eslint-disable eslint-comments/disable-enable-pair */
/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
import type * as AdminTypes from './admin.types.d.ts';

export type CoaFileStatusQueryVariables = AdminTypes.Exact<{
  ids: Array<AdminTypes.Scalars['ID']['input']> | AdminTypes.Scalars['ID']['input'];
}>;


export type CoaFileStatusQuery = { nodes: Array<AdminTypes.Maybe<{ __typename: 'AbandonedCheckout' | 'AbandonedCheckoutLineItem' | 'Abandonment' | 'AddAllProductsOperation' | 'AdditionalFee' | 'App' | 'AppCatalog' | 'AppCredit' | 'AppInstallation' | 'AppPurchaseOneTime' | 'AppRevenueAttributionRecord' | 'AppSubscription' | 'AppUsageRecord' | 'Article' | 'BasicEvent' | 'Blog' | 'BulkOperation' | 'BusinessEntity' | 'CalculatedOrder' | 'CartTransform' } | { __typename: 'CashDrawer' | 'CashManagementCustomReasonCode' | 'CashManagementDefaultReasonCode' | 'CashManagementSystemReasonCode' | 'CashTrackingAdjustment' | 'CashTrackingSession' | 'CatalogCsvOperation' | 'Channel' | 'ChannelDefinition' | 'ChannelInformation' | 'CheckoutAndAccountsConfiguration' | 'CheckoutAndAccountsConfigurationOverride' | 'CheckoutProfile' | 'Collection' | 'CollectionConditionsSource' | 'CollectionSubCollectionsSource' | 'Comment' | 'CommentEvent' | 'Company' | 'CompanyAddress' } | { __typename: 'CompanyContact' | 'CompanyContactRole' | 'CompanyContactRoleAssignment' | 'CompanyLocation' | 'CompanyLocationCatalog' | 'CompanyLocationStaffMemberAssignment' | 'ConsentPolicy' | 'CurrencyExchangeAdjustment' | 'Customer' | 'CustomerAccountAppExtensionPage' | 'CustomerAccountNativePage' | 'CustomerPaymentMethod' | 'CustomerSegmentMembersQuery' | 'CustomerVisit' | 'DeliveryCarrierService' | 'DeliveryCondition' | 'DeliveryCountry' | 'DeliveryCustomization' | 'DeliveryLocationGroup' | 'DeliveryMethod' } | { __typename: 'DeliveryMethodDefinition' | 'DeliveryParticipant' | 'DeliveryProfile' | 'DeliveryProfileItem' | 'DeliveryPromiseParticipant' | 'DeliveryPromiseProvider' | 'DeliveryProvince' | 'DeliveryRateDefinition' | 'DeliveryZone' | 'DiscountAutomaticBxgy' | 'DiscountAutomaticNode' | 'DiscountCodeNode' | 'DiscountNode' | 'DiscountRedeemCodeBulkCreation' | 'Domain' | 'DraftOrder' | 'DraftOrderLineItem' | 'DraftOrderTag' | 'Duty' | 'ExchangeLineItem' } | { __typename: 'ExchangeV2' | 'ExternalVideo' | 'Fulfillment' | 'FulfillmentConstraintRule' | 'FulfillmentEvent' | 'FulfillmentHold' | 'FulfillmentLineItem' | 'FulfillmentOrder' | 'FulfillmentOrderDestination' | 'FulfillmentOrderLineItem' | 'FulfillmentOrderMerchantRequest' | 'GenericFile' | 'GiftCard' | 'GiftCardCashOutTransaction' | 'GiftCardCreditTransaction' | 'GiftCardDebitTransaction' | 'IdentityProviderSubject' | 'InventoryAdjustmentGroup' | 'InventoryItem' | 'InventoryItemMeasurement' } | { __typename: 'InventoryLevel' | 'InventoryQuantity' | 'InventoryShipment' | 'InventoryShipmentLineItem' | 'InventoryTransfer' | 'InventoryTransferLineItem' | 'LineItem' | 'LineItemGroup' | 'Location' | 'MailingAddress' | 'Market' | 'MarketCatalog' | 'MarketRegionCountry' | 'MarketRegionSubdivision' | 'MarketWebPresence' | 'MarketingActivity' | 'MarketingEvent' | 'Menu' | 'Metafield' | 'MetafieldDefinition' } | { __typename: 'Metaobject' | 'MetaobjectDefinition' | 'Model3d' | 'OnlineStoreTheme' | 'Order' | 'OrderAdjustment' | 'OrderAttributionDefinition' | 'OrderCreateMandatePaymentJobResult' | 'OrderDisputeSummary' | 'OrderEditSession' | 'OrderTransaction' | 'Page' | 'PaymentCustomization' | 'PaymentMandate' | 'PaymentSchedule' | 'PaymentTerms' | 'PaymentTermsTemplate' | 'PointOfSaleDevice' | 'PointOfSaleDevicePaymentSession' | 'PriceList' } | { __typename: 'PriceRule' | 'PriceRuleDiscountCode' | 'Product' | 'ProductBundleOperation' | 'ProductDeleteOperation' | 'ProductDuplicateOperation' | 'ProductFeed' | 'ProductOption' | 'ProductOptionValue' | 'ProductSetOperation' | 'ProductTaxonomyNode' | 'ProductVariant' | 'ProductVariantComponent' | 'Publication' | 'PublicationResourceOperation' | 'QuantityPriceBreak' | 'Refund' | 'RefundShippingLine' | 'Return' | 'ReturnLineItem' } | { __typename: 'ReturnReasonDefinition' | 'ReturnableFulfillment' | 'ReverseDelivery' | 'ReverseDeliveryLineItem' | 'ReverseFulfillmentOrder' | 'ReverseFulfillmentOrderDisposition' | 'ReverseFulfillmentOrderLineItem' | 'SaleAdditionalFee' | 'SavedSearch' | 'ScriptTag' | 'Segment' | 'SellingPlan' | 'SellingPlanGroup' | 'ServerPixel' | 'ShippingLabel' | 'ShippingLabelPurchaseResult' | 'Shop' | 'ShopAddress' | 'ShopPolicy' | 'ShopifyPaymentsAccount' } | { __typename: 'ShopifyPaymentsBalanceTransaction' | 'ShopifyPaymentsBankAccount' | 'ShopifyPaymentsDispute' | 'ShopifyPaymentsDisputeEvidence' | 'ShopifyPaymentsDisputeFileUpload' | 'ShopifyPaymentsDisputeFulfillment' | 'ShopifyPaymentsPayout' | 'StaffMember' | 'StandardMetafieldDefinitionTemplate' | 'StoreCreditAccount' | 'StoreCreditAccountCreditTransaction' | 'StoreCreditAccountDebitRevertTransaction' | 'StoreCreditAccountDebitTransaction' | 'StorefrontAccessToken' | 'SubscriptionBillingAttempt' | 'SubscriptionContract' | 'SubscriptionDraft' | 'TaxonomyAttribute' | 'TaxonomyCategory' | 'TaxonomyChoiceListAttribute' } | { __typename: 'TaxonomyMeasurementAttribute' | 'TaxonomyValue' | 'TenderTransaction' | 'TransactionFee' | 'UnverifiedReturnLineItem' | 'UrlRedirect' | 'UrlRedirectImport' | 'Validation' | 'WebPixel' | 'WebhookSubscription' } | (
    { __typename: 'MediaImage' }
    & Pick<AdminTypes.MediaImage, 'id' | 'fileStatus' | 'mimeType'>
    & { image?: AdminTypes.Maybe<(
      Pick<AdminTypes.Image, 'url'>
      & { jpgUrl: AdminTypes.Image['url'] }
    )>, fileErrors: Array<Pick<AdminTypes.FileError, 'code' | 'message'>> }
  ) | (
    { __typename: 'Video' }
    & Pick<AdminTypes.Video, 'id' | 'fileStatus'>
    & { sources: Array<Pick<AdminTypes.VideoSource, 'url' | 'format' | 'height' | 'mimeType'>>, originalSource?: AdminTypes.Maybe<Pick<AdminTypes.VideoSource, 'url'>>, preview?: AdminTypes.Maybe<{ image?: AdminTypes.Maybe<Pick<AdminTypes.Image, 'url'>> }>, fileErrors: Array<Pick<AdminTypes.FileError, 'code' | 'message'>> }
  )>> };

export type CoaDefinitionByTypeQueryVariables = AdminTypes.Exact<{
  type: AdminTypes.Scalars['String']['input'];
}>;


export type CoaDefinitionByTypeQuery = { metaobjectDefinitionByType?: AdminTypes.Maybe<(
    Pick<AdminTypes.MetaobjectDefinition, 'id' | 'type'>
    & { fieldDefinitions: Array<(
      Pick<AdminTypes.MetaobjectFieldDefinition, 'key'>
      & { type: Pick<AdminTypes.MetafieldDefinitionType, 'name'> }
    )> }
  )> };

export type CoaDefinitionCreateMutationVariables = AdminTypes.Exact<{
  definition: AdminTypes.MetaobjectDefinitionCreateInput;
}>;


export type CoaDefinitionCreateMutation = { metaobjectDefinitionCreate?: AdminTypes.Maybe<{ metaobjectDefinition?: AdminTypes.Maybe<Pick<AdminTypes.MetaobjectDefinition, 'id' | 'type'>>, userErrors: Array<Pick<AdminTypes.MetaobjectUserError, 'field' | 'message' | 'code'>> }> };

export type CoaDefinitionUpdateMutationVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
  definition: AdminTypes.MetaobjectDefinitionUpdateInput;
}>;


export type CoaDefinitionUpdateMutation = { metaobjectDefinitionUpdate?: AdminTypes.Maybe<{ metaobjectDefinition?: AdminTypes.Maybe<Pick<AdminTypes.MetaobjectDefinition, 'id'>>, userErrors: Array<Pick<AdminTypes.MetaobjectUserError, 'field' | 'message' | 'code'>> }> };

export type CoaCertificateUpsertMutationVariables = AdminTypes.Exact<{
  handle: AdminTypes.MetaobjectHandleInput;
  values: AdminTypes.Scalars['JSON']['input'];
}>;


export type CoaCertificateUpsertMutation = { metaobjectUpsert?: AdminTypes.Maybe<{ metaobject?: AdminTypes.Maybe<Pick<AdminTypes.Metaobject, 'id' | 'handle'>>, userErrors: Array<Pick<AdminTypes.MetaobjectUserError, 'field' | 'message' | 'code' | 'elementKey' | 'elementIndex'>> }> };

export type CoaCertificateDeleteMutationVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
}>;


export type CoaCertificateDeleteMutation = { metaobjectDelete?: AdminTypes.Maybe<(
    Pick<AdminTypes.MetaobjectDeletePayload, 'deletedId'>
    & { userErrors: Array<Pick<AdminTypes.MetaobjectUserError, 'field' | 'message' | 'code'>> }
  )> };

export type CoaCertificateByHandleQueryVariables = AdminTypes.Exact<{
  handle: AdminTypes.MetaobjectHandleInput;
}>;


export type CoaCertificateByHandleQuery = { metaobjectByHandle?: AdminTypes.Maybe<Pick<AdminTypes.Metaobject, 'id' | 'handle'>> };

export type CoaCertificateEntriesQueryVariables = AdminTypes.Exact<{
  type: AdminTypes.Scalars['String']['input'];
  after?: AdminTypes.InputMaybe<AdminTypes.Scalars['String']['input']>;
}>;


export type CoaCertificateEntriesQuery = { metaobjects: { nodes: Array<Pick<AdminTypes.Metaobject, 'id' | 'handle'>>, pageInfo: Pick<AdminTypes.PageInfo, 'hasNextPage' | 'endCursor'> } };

export type CoaOrderPickerQueryVariables = AdminTypes.Exact<{
  first: AdminTypes.Scalars['Int']['input'];
  query?: AdminTypes.InputMaybe<AdminTypes.Scalars['String']['input']>;
}>;


export type CoaOrderPickerQuery = { orders: { nodes: Array<(
      Pick<AdminTypes.Order, 'id' | 'name' | 'createdAt' | 'cancelledAt' | 'displayFulfillmentStatus' | 'currentSubtotalLineItemsQuantity'>
      & { lineItems: { nodes: Array<Pick<AdminTypes.LineItem, 'title' | 'currentQuantity' | 'isGiftCard'>> } }
    )>, pageInfo: Pick<AdminTypes.PageInfo, 'hasNextPage'> } };

export type CoaOrderLineItemsQueryVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
  after?: AdminTypes.InputMaybe<AdminTypes.Scalars['String']['input']>;
}>;


export type CoaOrderLineItemsQuery = { order?: AdminTypes.Maybe<(
    Pick<AdminTypes.Order, 'id' | 'name' | 'createdAt' | 'cancelledAt' | 'displayFulfillmentStatus'>
    & { lineItems: { nodes: Array<(
        Pick<AdminTypes.LineItem, 'id' | 'title' | 'variantTitle' | 'currentQuantity' | 'isGiftCard'>
        & { image?: AdminTypes.Maybe<Pick<AdminTypes.Image, 'url'>>, product?: AdminTypes.Maybe<(
          Pick<AdminTypes.Product, 'id' | 'title' | 'status'>
          & { featuredMedia?: AdminTypes.Maybe<{ preview?: AdminTypes.Maybe<{ image?: AdminTypes.Maybe<Pick<AdminTypes.Image, 'url'>> }> }> }
        )> }
      )>, pageInfo: Pick<AdminTypes.PageInfo, 'hasNextPage' | 'endCursor'> } }
  )> };

export type CoaProductsQueryVariables = AdminTypes.Exact<{
  ids: Array<AdminTypes.Scalars['ID']['input']> | AdminTypes.Scalars['ID']['input'];
}>;


export type CoaProductsQuery = { nodes: Array<AdminTypes.Maybe<(
    Pick<AdminTypes.Product, 'id' | 'title' | 'status'>
    & { featuredMedia?: AdminTypes.Maybe<{ preview?: AdminTypes.Maybe<{ image?: AdminTypes.Maybe<Pick<AdminTypes.Image, 'url'>> }> }> }
  )>> };

export type CoaShopInfoQueryVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type CoaShopInfoQuery = { shop: Pick<AdminTypes.Shop, 'name' | 'ianaTimezone' | 'orderNumberFormatPrefix' | 'orderNumberFormatSuffix'> };

export type CoaLegacyCertificatesQueryVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type CoaLegacyCertificatesQuery = { shop: { metafield?: AdminTypes.Maybe<Pick<AdminTypes.Metafield, 'jsonValue' | 'updatedAt'>> } };

interface GeneratedQueryTypes {
  "#graphql\n  query CoaFileStatus($ids: [ID!]!) {\n    nodes(ids: $ids) {\n      __typename\n      ... on MediaImage {\n        id\n        fileStatus\n        mimeType\n        image {\n          url\n          jpgUrl: url(transform: { preferredContentType: JPG })\n        }\n        fileErrors {\n          code\n          message\n        }\n      }\n      ... on Video {\n        id\n        fileStatus\n        sources {\n          url\n          format\n          height\n          mimeType\n        }\n        originalSource {\n          url\n        }\n        preview {\n          image {\n            url\n          }\n        }\n        fileErrors {\n          code\n          message\n        }\n      }\n    }\n  }\n": {return: CoaFileStatusQuery, variables: CoaFileStatusQueryVariables},
  "#graphql\n  query CoaDefinitionByType($type: String!) {\n    metaobjectDefinitionByType(type: $type) {\n      id\n      type\n      fieldDefinitions {\n        key\n        type {\n          name\n        }\n      }\n    }\n  }\n": {return: CoaDefinitionByTypeQuery, variables: CoaDefinitionByTypeQueryVariables},
  "#graphql\n  query CoaCertificateByHandle($handle: MetaobjectHandleInput!) {\n    metaobjectByHandle(handle: $handle) {\n      id\n      handle\n    }\n  }\n": {return: CoaCertificateByHandleQuery, variables: CoaCertificateByHandleQueryVariables},
  "#graphql\n  query CoaCertificateEntries($type: String!, $after: String) {\n    metaobjects(type: $type, first: 250, after: $after) {\n      nodes {\n        id\n        handle\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n": {return: CoaCertificateEntriesQuery, variables: CoaCertificateEntriesQueryVariables},
  "#graphql\n  query CoaOrderPicker($first: Int!, $query: String) {\n    orders(first: $first, sortKey: CREATED_AT, reverse: true, query: $query) {\n      nodes {\n        id\n        name\n        createdAt\n        cancelledAt\n        displayFulfillmentStatus\n        currentSubtotalLineItemsQuantity\n        lineItems(first: 5) {\n          nodes {\n            title\n            currentQuantity\n            isGiftCard\n          }\n        }\n      }\n      pageInfo {\n        hasNextPage\n      }\n    }\n  }\n": {return: CoaOrderPickerQuery, variables: CoaOrderPickerQueryVariables},
  "#graphql\n  query CoaOrderLineItems($id: ID!, $after: String) {\n    order(id: $id) {\n      id\n      name\n      createdAt\n      cancelledAt\n      displayFulfillmentStatus\n      lineItems(first: 50, after: $after) {\n        nodes {\n          id\n          title\n          variantTitle\n          currentQuantity\n          isGiftCard\n          image {\n            url(transform: { maxWidth: 160, maxHeight: 160 })\n          }\n          product {\n            id\n            title\n            status\n            featuredMedia {\n              preview {\n                image {\n                  url(transform: { maxWidth: 160, maxHeight: 160 })\n                }\n              }\n            }\n          }\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n": {return: CoaOrderLineItemsQuery, variables: CoaOrderLineItemsQueryVariables},
  "#graphql\n  query CoaProducts($ids: [ID!]!) {\n    nodes(ids: $ids) {\n      ... on Product {\n        id\n        title\n        status\n        featuredMedia {\n          preview {\n            image {\n              url\n            }\n          }\n        }\n      }\n    }\n  }\n": {return: CoaProductsQuery, variables: CoaProductsQueryVariables},
  "#graphql\n  query CoaShopInfo {\n    shop {\n      name\n      ianaTimezone\n      orderNumberFormatPrefix\n      orderNumberFormatSuffix\n    }\n  }\n": {return: CoaShopInfoQuery, variables: CoaShopInfoQueryVariables},
  "#graphql\n  query CoaLegacyCertificates {\n    shop {\n      metafield(namespace: \"custom\", key: \"certification_verification\") {\n        jsonValue\n        updatedAt\n      }\n    }\n  }\n": {return: CoaLegacyCertificatesQuery, variables: CoaLegacyCertificatesQueryVariables},
}

interface GeneratedMutationTypes {
  "#graphql\n  mutation CoaDefinitionCreate($definition: MetaobjectDefinitionCreateInput!) {\n    metaobjectDefinitionCreate(definition: $definition) {\n      metaobjectDefinition {\n        id\n        type\n      }\n      userErrors {\n        field\n        message\n        code\n      }\n    }\n  }\n": {return: CoaDefinitionCreateMutation, variables: CoaDefinitionCreateMutationVariables},
  "#graphql\n  mutation CoaDefinitionUpdate(\n    $id: ID!\n    $definition: MetaobjectDefinitionUpdateInput!\n  ) {\n    metaobjectDefinitionUpdate(id: $id, definition: $definition) {\n      metaobjectDefinition {\n        id\n      }\n      userErrors {\n        field\n        message\n        code\n      }\n    }\n  }\n": {return: CoaDefinitionUpdateMutation, variables: CoaDefinitionUpdateMutationVariables},
  "#graphql\n  mutation CoaCertificateUpsert($handle: MetaobjectHandleInput!, $values: JSON!) {\n    metaobjectUpsert(handle: $handle, values: $values) {\n      metaobject {\n        id\n        handle\n      }\n      userErrors {\n        field\n        message\n        code\n        elementKey\n        elementIndex\n      }\n    }\n  }\n": {return: CoaCertificateUpsertMutation, variables: CoaCertificateUpsertMutationVariables},
  "#graphql\n  mutation CoaCertificateDelete($id: ID!) {\n    metaobjectDelete(id: $id) {\n      deletedId\n      userErrors {\n        field\n        message\n        code\n      }\n    }\n  }\n": {return: CoaCertificateDeleteMutation, variables: CoaCertificateDeleteMutationVariables},
}
declare module '@shopify/admin-api-client' {
  type InputMaybe<T> = AdminTypes.InputMaybe<T>;
  interface AdminQueries extends GeneratedQueryTypes {}
  interface AdminMutations extends GeneratedMutationTypes {}
}
