import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Input } from 'heroui-native';
import { Search } from 'lucide-react-native';
import { usePeople } from '@/lib/wealthline';
import { colors } from '@/lib/wealthline-theme';
import { Page, Type, Panel, PersonRow, DataState, Empty } from '@/components/wealthline-ui';
export default function People() {
  const query = usePeople();
  const [search, setSearch] = useState('');
  const { width } = useWindowDimensions();
  const data = (query.data ?? []).filter(
    (p) =>
      !search ||
      `${p.name ?? ''} ${p.main_source ?? ''}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <Page>
      <View style={{ paddingTop: 50, paddingBottom: 35, gap: 28 }}>
        <Type
          weight="bold"
          style={{ fontSize: width >= 800 ? 56 : 38, lineHeight: 64, letterSpacing: -2 }}
        >
          The people.
        </Type>
        <View style={{ maxWidth: 400, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Search size={18} color={colors.muted} />
          <Input
            accessibilityLabel="Search people or companies"
            value={search}
            onChangeText={setSearch}
            placeholder="Search people or companies"
            className="bg-surface flex-1 rounded-full"
          />
        </View>
      </View>
      <DataState
        loading={query.isPending}
        error={query.isError}
        retry={() => void query.refetch()}
      />
      {!query.isPending &&
        !query.isError &&
        (data.length ? (
          <Panel style={{ paddingHorizontal: width >= 800 ? 30 : 18 }}>
            {data.map((p) => (
              <PersonRow key={p.id} person={p} />
            ))}
          </Panel>
        ) : (
          <Empty
            title="No people match your search."
            label="Clear search"
            action={() => setSearch('')}
          />
        ))}
    </Page>
  );
}
