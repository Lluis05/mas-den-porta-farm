import { Redirect, Stack } from 'expo-router';

import { useAdmin } from '@/lib/admin';
import { colors } from '@/theme';

/**
 * Cap pantalla d'aquí dins es pot obrir sense el PIN — ni escrivint la
 * URL directament (al web). Aquest layout necessita el seu propi <Stack>
 * (no <Slot>): és el que fa que cada pantalla d'aquí dins pugui fixar el
 * seu propi títol/header amb <Stack.Screen>, tal com ja feien abans de
 * quedar dins d'aquest grup.
 */
export default function AdminLayout() {
  const { isAdmin } = useAdmin();
  if (!isAdmin) return <Redirect href="/" />;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.targeta },
        headerTintColor: colors.primari,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.fons },
      }}
    />
  );
}
