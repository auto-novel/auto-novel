import type {
  ListOptions,
  ListSelectOption,
  ListTextOption,
  ListValue,
} from '@/components/list/types';
import router from '@/router';

export const onUpdatePage = (page: number) => {
  const route = router.currentRoute.value;
  const query = { ...route.query, page };
  router.push({ path: route.path, query });
};

export function onUpdateListValue(
  listOptions: ListOptions,
  listFilter: ListValue<ListOptions>,
) {
  const route = router.currentRoute.value;
  router.push({
    path: route.path,
    query: {
      ...route.query,
      page: 1,
      query: listFilter.搜索,
      selected: Object.entries(listOptions)
        .filter(([, option]) => option.type === 'select')
        .map(([label]) => listFilter[label] as number),
    },
  });
}

export interface UserListOptions extends ListOptions {
  搜索: ListTextOption;
  角色: ListSelectOption;
}

export type UserListValue = ListValue<UserListOptions>;

export function getUserListOptions(): UserListOptions {
  return {
    搜索: {
      type: 'text',
      history: 'web',
      placeholder: '请输入用户名或邮箱',
    },
    角色: {
      type: 'select',
      tags: ['所有', '普通用户', '管理员', '信任用户', '受限用户', '封禁用户'],
    },
  };
}
