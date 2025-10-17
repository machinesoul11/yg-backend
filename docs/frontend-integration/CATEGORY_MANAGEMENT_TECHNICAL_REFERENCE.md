# 🔧 Category Management - Technical Reference & Examples

> **Companion to**: Category Management Integration Guide  
> **Classification**: 🌐 SHARED - Used by both public-facing website and admin backend

## Table of Contents
1. [tRPC Utility Functions](#trpc-utility-functions)
2. [React Components Examples](#react-components-examples)
3. [State Management Patterns](#state-management-patterns)
4. [Advanced Use Cases](#advanced-use-cases)
5. [Performance Optimization](#performance-optimization)
6. [Testing Examples](#testing-examples)

---

## tRPC Utility Functions

### Custom Hooks for Category Management

```typescript
// hooks/useCategories.ts
import { trpc } from '@/lib/trpc';
import { useMemo } from 'react';

// Get all categories with caching and error handling
export const useCategories = (options?: {
  includeInactive?: boolean;
  search?: string;
  parentId?: string;
}) => {
  const {
    data: categories,
    isLoading,
    error,
    refetch
  } = trpc.blog.categories.list.useQuery({
    filters: {
      isActive: !options?.includeInactive,
      search: options?.search,
    },
    parentCategoryId: options?.parentId || undefined,
    includePostCount: true,
    includeChildren: true,
    sortBy: 'displayOrder',
    sortOrder: 'asc',
  });

  return {
    categories: categories?.categories || [],
    isLoading,
    error,
    refetch,
  };
};

// Get hierarchical category tree
export const useCategoryTree = () => {
  const { data, isLoading, error } = trpc.blog.allCategories.useQuery({
    includeEmpty: false,
    activeOnly: true,
    flat: false,
  });

  const categoryTree = useMemo(() => {
    if (!data) return [];
    return data; // Already hierarchical from backend
  }, [data]);

  return {
    categoryTree,
    isLoading,
    error,
  };
};

// Category mutations with optimistic updates
export const useCategoryMutations = () => {
  const utils = trpc.useUtils();

  const createCategory = trpc.blog.categories.create.useMutation({
    onMutate: async (newCategory) => {
      // Cancel outgoing refetches
      await utils.blog.categories.list.cancel();

      // Snapshot previous value
      const previousCategories = utils.blog.categories.list.getData();

      // Optimistically update
      const tempCategory = {
        id: `temp-${Date.now()}`,
        ...newCategory,
        slug: newCategory.slug || generateSlug(newCategory.name),
        createdAt: new Date(),
        updatedAt: new Date(),
        postCount: 0,
      };

      utils.blog.categories.list.setData(
        undefined,
        (old) => old ? {
          ...old,
          categories: [...old.categories, tempCategory]
        } : undefined
      );

      return { previousCategories };
    },
    onError: (err, newCategory, context) => {
      // Rollback optimistic update
      utils.blog.categories.list.setData(
        undefined,
        context?.previousCategories
      );
    },
    onSettled: () => {
      // Refetch to ensure data consistency
      utils.blog.categories.list.invalidate();
    },
  });

  const updateCategory = trpc.blog.categories.update.useMutation({
    onMutate: async ({ id, data: updates }) => {
      await utils.blog.categories.list.cancel();
      const previousCategories = utils.blog.categories.list.getData();

      utils.blog.categories.list.setData(
        undefined,
        (old) => old ? {
          ...old,
          categories: old.categories.map(cat =>
            cat.id === id ? { ...cat, ...updates, updatedAt: new Date() } : cat
          )
        } : undefined
      );

      return { previousCategories };
    },
    onError: (err, variables, context) => {
      utils.blog.categories.list.setData(
        undefined,
        context?.previousCategories
      );
    },
    onSettled: () => {
      utils.blog.categories.list.invalidate();
    },
  });

  const deleteCategory = trpc.blog.categories.delete.useMutation({
    onMutate: async ({ id }) => {
      await utils.blog.categories.list.cancel();
      const previousCategories = utils.blog.categories.list.getData();

      utils.blog.categories.list.setData(
        undefined,
        (old) => old ? {
          ...old,
          categories: old.categories.filter(cat => cat.id !== id)
        } : undefined
      );

      return { previousCategories };
    },
    onError: (err, variables, context) => {
      utils.blog.categories.list.setData(
        undefined,
        context?.previousCategories
      );
    },
    onSettled: () => {
      utils.blog.categories.list.invalidate();
    },
  });

  return {
    createCategory,
    updateCategory,
    deleteCategory,
  };
};
```

### Utility Functions

```typescript
// utils/categoryUtils.ts

// Generate URL-friendly slug from category name
export const generateSlug = (name: string): string => {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-')     // Replace spaces with hyphens
    .replace(/-+/g, '-')      // Replace multiple hyphens with single
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
};

// Build category breadcrumb path
export const buildCategoryPath = (
  categoryId: string,
  categories: Category[]
): Array<{ id: string; name: string; slug: string }> => {
  const path: Array<{ id: string; name: string; slug: string }> = [];
  const visited = new Set<string>();
  let currentId: string | null = categoryId;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const category = categories.find(cat => cat.id === currentId);
    if (!category) break;

    path.unshift({
      id: category.id,
      name: category.name,
      slug: category.slug,
    });
    currentId = category.parentCategoryId;
  }

  return path;
};

// Flatten hierarchical category tree
export const flattenCategoryTree = (categories: CategoryTree[]): Category[] => {
  const flattened: Category[] = [];

  const flatten = (cats: CategoryTree[], depth: number = 0) => {
    cats.forEach(cat => {
      flattened.push({ ...cat, depth } as Category & { depth: number });
      if (cat.children?.length) {
        flatten(cat.children, depth + 1);
      }
    });
  };

  flatten(categories);
  return flattened;
};

// Validate category hierarchy (prevent circular references)
export const validateCategoryParent = (
  categoryId: string,
  newParentId: string,
  categories: Category[]
): boolean => {
  if (categoryId === newParentId) return false;

  const visited = new Set<string>();
  let currentParentId: string | null = newParentId;

  while (currentParentId && !visited.has(currentParentId)) {
    if (currentParentId === categoryId) return false;
    visited.add(currentParentId);

    const parent = categories.find(cat => cat.id === currentParentId);
    currentParentId = parent?.parentCategoryId || null;
  }

  return true;
};

// Sort categories by display order and name
export const sortCategories = (categories: Category[]): Category[] => {
  return [...categories].sort((a, b) => {
    if (a.displayOrder !== b.displayOrder) {
      return a.displayOrder - b.displayOrder;
    }
    return a.name.localeCompare(b.name);
  });
};
```

---

## React Components Examples

### CategorySelector Component

```typescript
// components/CategorySelector.tsx
import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCategoryTree } from '@/hooks/useCategories';
import { flattenCategoryTree } from '@/utils/categoryUtils';

interface CategorySelectorProps {
  value?: string;
  onChange: (categoryId: string | null) => void;
  placeholder?: string;
  includeEmpty?: boolean;
  excludeId?: string; // Exclude specific category (for parent selection)
}

export const CategorySelector: React.FC<CategorySelectorProps> = ({
  value,
  onChange,
  placeholder = "Select a category",
  includeEmpty = true,
  excludeId,
}) => {
  const { categoryTree, isLoading } = useCategoryTree();

  const flatCategories = useMemo(() => {
    const flattened = flattenCategoryTree(categoryTree);
    return excludeId ? flattened.filter(cat => cat.id !== excludeId) : flattened;
  }, [categoryTree, excludeId]);

  if (isLoading) {
    return (
      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder="Loading categories..." />
        </SelectTrigger>
      </Select>
    );
  }

  return (
    <Select
      value={value || ''}
      onValueChange={(val) => onChange(val || null)}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {includeEmpty && (
          <SelectItem value="">
            <span className="text-gray-500">No category</span>
          </SelectItem>
        )}
        {flatCategories.map((category) => (
          <SelectItem key={category.id} value={category.id}>
            <span style={{ paddingLeft: `${(category.depth || 0) * 16}px` }}>
              {category.name}
              {category.postCount !== undefined && (
                <span className="text-gray-500 ml-2">({category.postCount})</span>
              )}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
```

### CategoryTree Component

```typescript
// components/CategoryTree.tsx
import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Folder, FolderOpen } from 'lucide-react';
import { useCategoryTree } from '@/hooks/useCategories';

interface CategoryTreeProps {
  onCategorySelect?: (category: Category) => void;
  selectedCategoryId?: string;
  showPostCounts?: boolean;
}

export const CategoryTree: React.FC<CategoryTreeProps> = ({
  onCategorySelect,
  selectedCategoryId,
  showPostCounts = true,
}) => {
  const { categoryTree, isLoading } = useCategoryTree();
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const toggleExpand = (categoryId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
    }
    setExpandedNodes(newExpanded);
  };

  const renderCategory = (category: CategoryTree, depth: number = 0) => {
    const hasChildren = category.children && category.children.length > 0;
    const isExpanded = expandedNodes.has(category.id);
    const isSelected = selectedCategoryId === category.id;

    return (
      <div key={category.id} className="select-none">
        <div
          className={`flex items-center p-2 hover:bg-gray-100 cursor-pointer ${
            isSelected ? 'bg-blue-100 border-l-4 border-blue-500' : ''
          }`}
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
          onClick={() => onCategorySelect?.(category)}
        >
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(category.id);
              }}
              className="mr-1 p-0.5 hover:bg-gray-200 rounded"
            >
              {isExpanded ? (
                <ChevronDown size={16} />
              ) : (
                <ChevronRight size={16} />
              )}
            </button>
          ) : (
            <div className="w-6" />
          )}

          {hasChildren ? (
            isExpanded ? (
              <FolderOpen size={16} className="mr-2 text-blue-600" />
            ) : (
              <Folder size={16} className="mr-2 text-blue-600" />
            )
          ) : (
            <div className="w-4 h-4 mr-2 border border-gray-300 rounded-sm bg-gray-50" />
          )}

          <span className="flex-1 truncate">{category.name}</span>

          {showPostCounts && category.postCount !== undefined && (
            <span className="text-xs text-gray-500 ml-2">
              {category.postCount}
            </span>
          )}
        </div>

        {hasChildren && isExpanded && (
          <div>
            {category.children.map((child) =>
              renderCategory(child, depth + 1)
            )}
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="p-4 text-center text-gray-500">
        Loading categories...
      </div>
    );
  }

  if (!categoryTree || categoryTree.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        No categories found
      </div>
    );
  }

  return (
    <div className="border rounded-lg bg-white">
      {categoryTree.map((category) => renderCategory(category))}
    </div>
  );
};
```

### CategoryForm Component

```typescript
// components/CategoryForm.tsx
import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createCategorySchema } from '@/schemas/category';
import { useCategoryMutations } from '@/hooks/useCategories';
import { CategorySelector } from './CategorySelector';
import { generateSlug, validateCategoryParent } from '@/utils/categoryUtils';

interface CategoryFormProps {
  category?: Category;
  onSuccess?: (category: Category) => void;
  onCancel?: () => void;
}

export const CategoryForm: React.FC<CategoryFormProps> = ({
  category,
  onSuccess,
  onCancel,
}) => {
  const isEditing = !!category;
  const { createCategory, updateCategory } = useCategoryMutations();

  const form = useForm({
    resolver: zodResolver(createCategorySchema),
    defaultValues: {
      name: category?.name || '',
      slug: category?.slug || '',
      description: category?.description || '',
      parentCategoryId: category?.parentCategoryId || null,
      displayOrder: category?.displayOrder || 0,
      isActive: category?.isActive ?? true,
    },
  });

  // Auto-generate slug from name
  const watchedName = form.watch('name');
  const watchedSlug = form.watch('slug');

  useEffect(() => {
    if (watchedName && !isEditing && !watchedSlug) {
      const slug = generateSlug(watchedName);
      form.setValue('slug', slug);
    }
  }, [watchedName, isEditing, watchedSlug, form]);

  const onSubmit = async (data: any) => {
    try {
      if (isEditing) {
        const result = await updateCategory.mutateAsync({
          id: category.id,
          data,
        });
        onSuccess?.(result);
      } else {
        const result = await createCategory.mutateAsync(data);
        onSuccess?.(result);
      }
    } catch (error) {
      console.error('Failed to save category:', error);
    }
  };

  const isLoading = createCategory.isPending || updateCategory.isPending;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-2">
          Category Name *
        </label>
        <input
          {...form.register('name')}
          type="text"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Enter category name"
        />
        {form.formState.errors.name && (
          <p className="text-red-500 text-sm mt-1">
            {form.formState.errors.name.message}
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">
          URL Slug
        </label>
        <input
          {...form.register('slug')}
          type="text"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="auto-generated-from-name"
        />
        {form.formState.errors.slug && (
          <p className="text-red-500 text-sm mt-1">
            {form.formState.errors.slug.message}
          </p>
        )}
        <p className="text-gray-500 text-sm mt-1">
          Leave empty to auto-generate from the category name
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">
          Description
        </label>
        <textarea
          {...form.register('description')}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Optional description for this category"
        />
        {form.formState.errors.description && (
          <p className="text-red-500 text-sm mt-1">
            {form.formState.errors.description.message}
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">
          Parent Category
        </label>
        <CategorySelector
          value={form.watch('parentCategoryId')}
          onChange={(parentId) => form.setValue('parentCategoryId', parentId)}
          placeholder="Select parent category (optional)"
          excludeId={category?.id} // Prevent selecting self as parent
        />
        {form.formState.errors.parentCategoryId && (
          <p className="text-red-500 text-sm mt-1">
            {form.formState.errors.parentCategoryId.message}
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">
          Display Order
        </label>
        <input
          {...form.register('displayOrder', { valueAsNumber: true })}
          type="number"
          min="0"
          max="9999"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="0"
        />
        {form.formState.errors.displayOrder && (
          <p className="text-red-500 text-sm mt-1">
            {form.formState.errors.displayOrder.message}
          </p>
        )}
        <p className="text-gray-500 text-sm mt-1">
          Lower numbers appear first. Categories with the same order are sorted alphabetically.
        </p>
      </div>

      <div className="flex items-center">
        <input
          {...form.register('isActive')}
          type="checkbox"
          id="isActive"
          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
        />
        <label htmlFor="isActive" className="ml-2 block text-sm text-gray-900">
          Active (visible to public)
        </label>
      </div>

      <div className="flex justify-end space-x-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            disabled={isLoading}
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isLoading}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {isLoading ? 'Saving...' : isEditing ? 'Update Category' : 'Create Category'}
        </button>
      </div>
    </form>
  );
};
```

---

## State Management Patterns

### Zustand Store for Category Management

```typescript
// stores/categoryStore.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface CategoryState {
  // Selected category for forms/editing
  selectedCategory: Category | null;
  setSelectedCategory: (category: Category | null) => void;

  // UI state
  showCategoryForm: boolean;
  setShowCategoryForm: (show: boolean) => void;

  // Search and filters
  searchTerm: string;
  setSearchTerm: (term: string) => void;

  showInactive: boolean;
  setShowInactive: (show: boolean) => void;

  // Tree state
  expandedNodes: Set<string>;
  toggleNode: (nodeId: string) => void;
  expandAll: () => void;
  collapseAll: () => void;

  // Breadcrumb navigation
  breadcrumb: Array<{ id: string; name: string; slug: string }>;
  setBreadcrumb: (breadcrumb: Array<{ id: string; name: string; slug: string }>) => void;
}

export const useCategoryStore = create<CategoryState>()(
  devtools(
    (set, get) => ({
      selectedCategory: null,
      setSelectedCategory: (category) => set({ selectedCategory: category }),

      showCategoryForm: false,
      setShowCategoryForm: (show) => set({ showCategoryForm: show }),

      searchTerm: '',
      setSearchTerm: (term) => set({ searchTerm: term }),

      showInactive: false,
      setShowInactive: (show) => set({ showInactive: show }),

      expandedNodes: new Set(),
      toggleNode: (nodeId) => set((state) => {
        const newExpanded = new Set(state.expandedNodes);
        if (newExpanded.has(nodeId)) {
          newExpanded.delete(nodeId);
        } else {
          newExpanded.add(nodeId);
        }
        return { expandedNodes: newExpanded };
      }),
      expandAll: () => set({ expandedNodes: new Set(['all']) }), // Special marker
      collapseAll: () => set({ expandedNodes: new Set() }),

      breadcrumb: [],
      setBreadcrumb: (breadcrumb) => set({ breadcrumb }),
    }),
    { name: 'category-store' }
  )
);
```

### Context Provider Pattern

```typescript
// contexts/CategoryContext.tsx
import React, { createContext, useContext, ReactNode } from 'react';
import { useCategories, useCategoryTree } from '@/hooks/useCategories';

interface CategoryContextValue {
  categories: Category[];
  categoryTree: CategoryTree[];
  isLoading: boolean;
  error: any;
  refetch: () => void;
}

const CategoryContext = createContext<CategoryContextValue | undefined>(undefined);

export const CategoryProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { categories, isLoading: categoriesLoading, error: categoriesError, refetch: refetchCategories } = useCategories();
  const { categoryTree, isLoading: treeLoading, error: treeError } = useCategoryTree();

  const value: CategoryContextValue = {
    categories,
    categoryTree,
    isLoading: categoriesLoading || treeLoading,
    error: categoriesError || treeError,
    refetch: refetchCategories,
  };

  return (
    <CategoryContext.Provider value={value}>
      {children}
    </CategoryContext.Provider>
  );
};

export const useCategoryContext = () => {
  const context = useContext(CategoryContext);
  if (!context) {
    throw new Error('useCategoryContext must be used within a CategoryProvider');
  }
  return context;
};
```

---

## Advanced Use Cases

### Category-based Post Filtering

```typescript
// components/PostsByCategoryPage.tsx
import React from 'react';
import { useRouter } from 'next/router';
import { trpc } from '@/lib/trpc';
import { CategoryBreadcrumbs } from './CategoryBreadcrumbs';
import { PostList } from './PostList';

export const PostsByCategoryPage: React.FC = () => {
  const router = useRouter();
  const { slug } = router.query;

  const {
    data: categoryData,
    isLoading,
    error,
  } = trpc.blog.postsByCategory.useQuery(
    {
      categorySlug: slug as string,
      includeSubcategories: true,
      page: 1,
      limit: 20,
      sortBy: 'publishedAt',
      sortOrder: 'desc',
    },
    {
      enabled: !!slug,
    }
  );

  if (isLoading) return <div>Loading posts...</div>;
  if (error) return <div>Error loading posts</div>;
  if (!categoryData) return <div>Category not found</div>;

  return (
    <div className="container mx-auto px-4 py-8">
      <CategoryBreadcrumbs category={categoryData.category} />
      
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4">{categoryData.category.name}</h1>
        {categoryData.category.description && (
          <p className="text-gray-600 text-lg">{categoryData.category.description}</p>
        )}
      </div>

      <PostList
        posts={categoryData.posts}
        pagination={categoryData.pagination}
      />
    </div>
  );
};
```

### Dynamic Category Menu

```typescript
// components/CategoryMenu.tsx
import React from 'react';
import Link from 'next/link';
import { useCategoryTree } from '@/hooks/useCategories';
import { ChevronDown } from 'lucide-react';

export const CategoryMenu: React.FC = () => {
  const { categoryTree, isLoading } = useCategoryTree();

  if (isLoading) return <div>Loading menu...</div>;

  const renderMenuItem = (category: CategoryTree) => {
    const hasChildren = category.children && category.children.length > 0;

    return (
      <div key={category.id} className="relative group">
        <Link
          href={`/blog/category/${category.slug}`}
          className="flex items-center px-4 py-2 text-gray-700 hover:text-blue-600 hover:bg-gray-100 rounded-md"
        >
          {category.name}
          {hasChildren && (
            <ChevronDown size={16} className="ml-1 group-hover:rotate-180 transition-transform" />
          )}
        </Link>

        {hasChildren && (
          <div className="absolute left-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
            {category.children.map((child) => (
              <Link
                key={child.id}
                href={`/blog/category/${child.slug}`}
                className="block px-4 py-2 text-sm text-gray-700 hover:text-blue-600 hover:bg-gray-100"
              >
                {child.name}
                {child.postCount !== undefined && (
                  <span className="text-gray-400 ml-2">({child.postCount})</span>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <nav className="flex flex-wrap gap-2">
      {categoryTree.map(renderMenuItem)}
    </nav>
  );
};
```

### Bulk Category Operations

```typescript
// components/BulkCategoryOperations.tsx
import React, { useState } from 'react';
import { useCategoryMutations } from '@/hooks/useCategories';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';

interface BulkCategoryOperationsProps {
  categories: Category[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

export const BulkCategoryOperations: React.FC<BulkCategoryOperationsProps> = ({
  categories,
  selectedIds,
  onSelectionChange,
}) => {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const { deleteCategory } = useCategoryMutations();

  const handleSelectAll = () => {
    if (selectedIds.length === categories.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(categories.map(cat => cat.id));
    }
  };

  const handleBulkDelete = async () => {
    if (!isConfirmingDelete) {
      setIsConfirmingDelete(true);
      return;
    }

    try {
      for (const id of selectedIds) {
        await deleteCategory.mutateAsync({ id });
      }
      onSelectionChange([]);
      setIsConfirmingDelete(false);
    } catch (error) {
      console.error('Bulk delete failed:', error);
    }
  };

  const selectedCategories = categories.filter(cat => selectedIds.includes(cat.id));
  const hasPostsAssigned = selectedCategories.some(cat => cat.postCount && cat.postCount > 0);

  return (
    <div className="bg-gray-50 p-4 border-b">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Checkbox
            checked={selectedIds.length === categories.length}
            onCheckedChange={handleSelectAll}
          />
          <span className="text-sm text-gray-600">
            {selectedIds.length} of {categories.length} selected
          </span>
        </div>

        {selectedIds.length > 0 && (
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              onClick={() => onSelectionChange([])}
            >
              Clear Selection
            </Button>

            {hasPostsAssigned ? (
              <Button variant="destructive" disabled>
                Cannot Delete (Posts Assigned)
              </Button>
            ) : (
              <Button
                variant={isConfirmingDelete ? "destructive" : "outline"}
                onClick={handleBulkDelete}
                disabled={deleteCategory.isPending}
              >
                {isConfirmingDelete
                  ? `Confirm Delete ${selectedIds.length} Categories`
                  : `Delete Selected (${selectedIds.length})`
                }
              </Button>
            )}
          </div>
        )}
      </div>

      {isConfirmingDelete && (
        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
          <p className="text-sm text-red-700">
            This action cannot be undone. Click "Confirm Delete" again to proceed.
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsConfirmingDelete(false)}
            className="mt-1"
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
};
```

---

## Performance Optimization

### Virtual Scrolling for Large Lists

```typescript
// components/VirtualizedCategoryList.tsx
import React from 'react';
import { FixedSizeList as List } from 'react-window';
import { useCategories } from '@/hooks/useCategories';

interface CategoryRowProps {
  index: number;
  style: React.CSSProperties;
  data: Category[];
}

const CategoryRow: React.FC<CategoryRowProps> = ({ index, style, data }) => {
  const category = data[index];

  return (
    <div style={style} className="px-4 py-2 border-b border-gray-200 flex items-center">
      <div className="flex-1">
        <h3 className="font-medium">{category.name}</h3>
        <p className="text-sm text-gray-500">{category.slug}</p>
      </div>
      <div className="text-sm text-gray-500">
        {category.postCount} posts
      </div>
    </div>
  );
};

export const VirtualizedCategoryList: React.FC = () => {
  const { categories, isLoading } = useCategories();

  if (isLoading) return <div>Loading...</div>;

  return (
    <List
      height={600}
      itemCount={categories.length}
      itemSize={80}
      itemData={categories}
    >
      {CategoryRow}
    </List>
  );
};
```

### Debounced Search

```typescript
// hooks/useDebouncedSearch.ts
import { useState, useEffect, useMemo } from 'react';
import { useCategories } from './useCategories';

export const useDebouncedCategorySearch = (delay: number = 300) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, delay);

    return () => clearTimeout(timer);
  }, [searchTerm, delay]);

  const { categories, isLoading, error } = useCategories({
    search: debouncedSearchTerm || undefined,
  });

  const filteredCategories = useMemo(() => {
    if (!debouncedSearchTerm) return categories;
    
    const lowerSearchTerm = debouncedSearchTerm.toLowerCase();
    return categories.filter(category =>
      category.name.toLowerCase().includes(lowerSearchTerm) ||
      category.slug.toLowerCase().includes(lowerSearchTerm) ||
      category.description?.toLowerCase().includes(lowerSearchTerm)
    );
  }, [categories, debouncedSearchTerm]);

  return {
    searchTerm,
    setSearchTerm,
    filteredCategories,
    isLoading,
    error,
    isSearching: searchTerm !== debouncedSearchTerm,
  };
};
```

### Memoized Tree Calculations

```typescript
// utils/categoryTreeUtils.ts
import { useMemo } from 'react';

export const useMemoizedCategoryTree = (categories: Category[]) => {
  return useMemo(() => {
    // Build hierarchical tree
    const categoryMap = new Map<string, CategoryTree>();
    const rootCategories: CategoryTree[] = [];

    // First pass: create all category nodes
    categories.forEach(category => {
      categoryMap.set(category.id, {
        ...category,
        children: [],
      });
    });

    // Second pass: build parent-child relationships
    categories.forEach(category => {
      const categoryNode = categoryMap.get(category.id)!;
      
      if (category.parentCategoryId) {
        const parent = categoryMap.get(category.parentCategoryId);
        if (parent) {
          parent.children.push(categoryNode);
        } else {
          // Parent not found, treat as root
          rootCategories.push(categoryNode);
        }
      } else {
        rootCategories.push(categoryNode);
      }
    });

    // Sort categories at each level
    const sortChildren = (categories: CategoryTree[]) => {
      categories.sort((a, b) => {
        if (a.displayOrder !== b.displayOrder) {
          return a.displayOrder - b.displayOrder;
        }
        return a.name.localeCompare(b.name);
      });

      categories.forEach(category => {
        if (category.children.length > 0) {
          sortChildren(category.children);
        }
      });
    };

    sortChildren(rootCategories);
    return rootCategories;
  }, [categories]);
};
```

---

## Testing Examples

### Component Testing with React Testing Library

```typescript
// __tests__/CategorySelector.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CategorySelector } from '../components/CategorySelector';
import { trpc } from '../lib/trpc';

// Mock tRPC
jest.mock('../lib/trpc', () => ({
  blog: {
    allCategories: {
      useQuery: jest.fn(),
    },
  },
}));

const mockCategories = [
  {
    id: '1',
    name: 'Technology',
    slug: 'technology',
    description: null,
    parentCategoryId: null,
    displayOrder: 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    children: [
      {
        id: '2',
        name: 'Web Development',
        slug: 'web-development',
        description: null,
        parentCategoryId: '1',
        displayOrder: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        children: [],
      },
    ],
  },
];

describe('CategorySelector', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  const renderComponent = (props = {}) => {
    const defaultProps = {
      onChange: jest.fn(),
      ...props,
    };

    return render(
      <QueryClientProvider client={queryClient}>
        <CategorySelector {...defaultProps} />
      </QueryClientProvider>
    );
  };

  it('renders loading state', () => {
    (trpc.blog.allCategories.useQuery as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    renderComponent();
    expect(screen.getByText('Loading categories...')).toBeInTheDocument();
  });

  it('renders categories with hierarchy', async () => {
    (trpc.blog.allCategories.useQuery as jest.Mock).mockReturnValue({
      data: mockCategories,
      isLoading: false,
      error: null,
    });

    const onChange = jest.fn();
    renderComponent({ onChange });

    fireEvent.click(screen.getByRole('combobox'));

    await waitFor(() => {
      expect(screen.getByText('Technology')).toBeInTheDocument();
      expect(screen.getByText('Web Development')).toBeInTheDocument();
    });
  });

  it('calls onChange when category is selected', async () => {
    (trpc.blog.allCategories.useQuery as jest.Mock).mockReturnValue({
      data: mockCategories,
      isLoading: false,
      error: null,
    });

    const onChange = jest.fn();
    renderComponent({ onChange });

    fireEvent.click(screen.getByRole('combobox'));
    
    await waitFor(() => {
      fireEvent.click(screen.getByText('Technology'));
    });

    expect(onChange).toHaveBeenCalledWith('1');
  });

  it('excludes specified category ID', async () => {
    (trpc.blog.allCategories.useQuery as jest.Mock).mockReturnValue({
      data: mockCategories,
      isLoading: false,
      error: null,
    });

    renderComponent({ excludeId: '1' });

    fireEvent.click(screen.getByRole('combobox'));

    await waitFor(() => {
      expect(screen.queryByText('Technology')).not.toBeInTheDocument();
      expect(screen.getByText('Web Development')).toBeInTheDocument();
    });
  });
});
```

### Integration Testing

```typescript
// __tests__/categoryIntegration.test.ts
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCategories, useCategoryMutations } from '../hooks/useCategories';

// Mock API calls
const mockTrpc = {
  blog: {
    categories: {
      list: { useQuery: jest.fn() },
      create: { useMutation: jest.fn() },
      update: { useMutation: jest.fn() },
      delete: { useMutation: jest.fn() },
    },
  },
  useUtils: jest.fn(),
};

jest.mock('../lib/trpc', () => mockTrpc);

describe('Category Integration', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );

  it('fetches categories successfully', async () => {
    const mockCategories = [
      { id: '1', name: 'Test Category', slug: 'test-category' },
    ];

    mockTrpc.blog.categories.list.useQuery.mockReturnValue({
      data: { categories: mockCategories },
      isLoading: false,
      error: null,
    });

    const { result } = renderHook(() => useCategories(), { wrapper });

    await waitFor(() => {
      expect(result.current.categories).toEqual(mockCategories);
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('handles create category mutation', async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      id: '1',
      name: 'New Category',
      slug: 'new-category',
    });

    mockTrpc.blog.categories.create.useMutation.mockReturnValue({
      mutateAsync: mockCreate,
      isPending: false,
    });

    mockTrpc.useUtils.mockReturnValue({
      blog: {
        categories: {
          list: {
            cancel: jest.fn(),
            getData: jest.fn(),
            setData: jest.fn(),
            invalidate: jest.fn(),
          },
        },
      },
    });

    const { result } = renderHook(() => useCategoryMutations(), { wrapper });

    await result.current.createCategory.mutateAsync({
      name: 'New Category',
    });

    expect(mockCreate).toHaveBeenCalledWith({
      name: 'New Category',
    });
  });
});
```

### E2E Testing with Playwright

```typescript
// e2e/categoryManagement.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Category Management', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/admin/login');
    await page.fill('[data-testid="email"]', 'admin@yesgoddess.agency');
    await page.fill('[data-testid="password"]', 'password');
    await page.click('[data-testid="login-button"]');
    
    // Navigate to categories
    await page.goto('/admin/categories');
  });

  test('should create a new category', async ({ page }) => {
    await page.click('[data-testid="create-category-button"]');
    
    await page.fill('[data-testid="category-name"]', 'Test Category');
    await page.fill('[data-testid="category-description"]', 'A test category');
    
    await page.click('[data-testid="save-category-button"]');
    
    await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
    await expect(page.locator('text=Test Category')).toBeVisible();
  });

  test('should update category hierarchy', async ({ page }) => {
    // Create parent category
    await page.click('[data-testid="create-category-button"]');
    await page.fill('[data-testid="category-name"]', 'Parent Category');
    await page.click('[data-testid="save-category-button"]');
    
    // Create child category
    await page.click('[data-testid="create-category-button"]');
    await page.fill('[data-testid="category-name"]', 'Child Category');
    await page.selectOption('[data-testid="parent-category-select"]', { label: 'Parent Category' });
    await page.click('[data-testid="save-category-button"]');
    
    // Verify hierarchy
    await expect(page.locator('[data-testid="category-tree"]')).toContainText('Parent Category');
    await expect(page.locator('[data-testid="category-tree"]')).toContainText('Child Category');
  });

  test('should prevent circular references', async ({ page }) => {
    // Create category A
    await page.click('[data-testid="create-category-button"]');
    await page.fill('[data-testid="category-name"]', 'Category A');
    await page.click('[data-testid="save-category-button"]');
    
    // Create category B as child of A
    await page.click('[data-testid="create-category-button"]');
    await page.fill('[data-testid="category-name"]', 'Category B');
    await page.selectOption('[data-testid="parent-category-select"]', { label: 'Category A' });
    await page.click('[data-testid="save-category-button"]');
    
    // Try to edit A to be child of B (should fail)
    await page.click('[data-testid="edit-category-a"]');
    await page.selectOption('[data-testid="parent-category-select"]', { label: 'Category B' });
    await page.click('[data-testid="save-category-button"]');
    
    await expect(page.locator('[data-testid="error-message"]')).toContainText('circular reference');
  });
});
```

---

This technical reference provides comprehensive examples and patterns for implementing the Category Management module on the frontend. Use these examples as starting points and adapt them to match your specific UI framework and design system requirements.
