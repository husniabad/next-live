// src/authDirective.ts

import { GraphQLFieldResolver, GraphQLResolveInfo } from 'graphql';

export const authDirective = {
  auth: (
    resolve: GraphQLFieldResolver<any, any, any, GraphQLResolveInfo>,
    source: any,
    args: any,
    context: any,
    info: GraphQLResolveInfo // Add the 'info' argument
  ) => {
    if (!context.userId) {
      throw new Error('Not authenticated.');
    }
    return resolve(source, args, context, info); // Pass the 'info' argument to the original resolver
  },
};