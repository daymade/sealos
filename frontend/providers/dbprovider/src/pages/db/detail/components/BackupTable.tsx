import React, {
  forwardRef,
  useCallback,
  ForwardedRef,
  useImperativeHandle,
  useState,
  useMemo
} from 'react';
import {
  Box,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Flex,
  useDisclosure,
  Tooltip
} from '@chakra-ui/react';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import type { BackupItemType, DBDetailType } from '@/types/db';
import { useLoading } from '@/hooks/useLoading';
import { useToast } from '@/hooks/useToast';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { useConfirm } from '@/hooks/useConfirm';
import dayjs from 'dayjs';
import { BackupStatusEnum, backupTypeMap } from '@/constants/backup';
import { useTranslation } from 'next-i18next';
import { deleteBackup, getBackupPolicy, getBackupPolicyByCluster } from '@/api/backup';
import { getErrText } from '@/utils/tools';
import { getBackupList } from '@/api/backup';
import MyIcon from '@/components/Icon';

const BackupModal = dynamic(() => import('./BackupModal'));
const RestoreModal = dynamic(() => import('./RestoreModal'));

export type ComponentRef = {
  openBackup: () => void;
  backupProcessing: boolean;
};

const BackupTable = ({ db }: { db?: DBDetailType }, ref: ForwardedRef<ComponentRef>) => {
  if (!db) return <></>;
  const { t } = useTranslation();
  const { toast } = useToast();
  const { Loading, setIsLoading } = useLoading();
  const {
    isOpen: isOpenBackupModal,
    onOpen: onOpenBackupModal,
    onClose: onCloseBackupModal
  } = useDisclosure();

  const { openConfirm: openConfirmDel, ConfirmChild: RestartConfirmDelChild } = useConfirm({
    content: t('Confirm delete the backup')
  });

  const [restoreBackupName, setRestoreBackupName] = useState<string>();

  const {
    isInitialLoading,
    refetch,
    data: backups = [],
    isSuccess
  } = useQuery(
    ['intervalLoadBackups'],
    async () => {
      const backups: BackupItemType[] = await getBackupList(db.dbName);
      backups.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
      return backups;
    },
    {
      refetchInterval: 3000
    }
  );

  // hav processing backup
  const backupProcessing = useMemo(
    () => !!backups.find((item) => item.status.value === BackupStatusEnum.InProgress),
    [backups]
  );

  const confirmDel = useCallback(
    async (name: string) => {
      try {
        setIsLoading(true);
        await deleteBackup(name);
        await refetch();
      } catch (err) {
        toast({
          title: getErrText(err),
          status: 'error'
        });
      }
      setIsLoading(false);
    },
    [refetch, setIsLoading, toast]
  );

  const operationIconBoxStyles = {
    alignItems: 'center',
    justifyContent: 'center',
    w: '32px',
    h: '32px',
    borderRadius: '32px',
    mr: 3,
    cursor: 'pointer',
    _hover: { bg: '#EFF0F1' }
  };
  const operationIconStyles = {
    w: '18px'
  };

  const columns: {
    title: string;
    dataIndex?: keyof BackupItemType;
    key: string;
    render?: (item: BackupItemType, i: number) => React.ReactNode | string;
  }[] = [
    {
      title: 'Name',
      key: 'name',
      dataIndex: 'name'
    },
    {
      title: 'Remark',
      key: 'remark',
      dataIndex: 'remark'
    },
    {
      title: 'Status',
      key: 'status',
      render: (item: BackupItemType) => (
        <Flex color={item.status.color} alignItems={'center'}>
          {t(item.status.label)}
          {item.failureReason && (
            <Tooltip label={item.failureReason}>
              <QuestionOutlineIcon ml={1} />
            </Tooltip>
          )}
        </Flex>
      )
    },
    {
      title: 'Backup Time',
      key: 'backupTime',
      render: (item: BackupItemType) => <>{dayjs(item.startTime).format('YYYY/MM/DD HH:mm')}</>
    },
    {
      title: 'Type',
      key: 'type',
      render: (item: BackupItemType) => <>{t(backupTypeMap[item.type]?.label) || '-'}</>
    },
    {
      title: 'Operation',
      key: 'control',
      render: (item: BackupItemType) =>
        item.status.value !== BackupStatusEnum.InProgress ? (
          <Flex>
            <Tooltip label={t('Restore Backup')}>
              <Flex {...operationIconBoxStyles} onClick={() => setRestoreBackupName(item.name)}>
                <MyIcon name={'restore'} {...operationIconStyles} />
              </Flex>
            </Tooltip>
            {/* <Tooltip label={t('Download Backup')}>
            <Flex {...operationIconBoxStyles}>
              <MyIcon {...operationIconStyles} name={'download'} w={'16px'} />
            </Flex>
          </Tooltip> */}
            <Tooltip label={t('Delete Backup')}>
              <Flex
                {...operationIconBoxStyles}
                mr={0}
                _hover={{ bg: '#EFF0F1', color: 'red.600' }}
                onClick={openConfirmDel(() => confirmDel(item.name))}
              >
                <MyIcon name={'delete'} {...operationIconStyles} />
              </Flex>
            </Tooltip>
          </Flex>
        ) : null
    }
  ];

  useImperativeHandle(ref, () => ({
    openBackup: onOpenBackupModal,
    backupProcessing
  }));

  const { data, refetch: refetchPolicy } = useQuery(['initpolicy', db.dbName, db.dbType], () =>
    getBackupPolicyByCluster({
      dbName: db.dbName,
      dbType: db.dbType
    })
  );

  return (
    <Flex flexDirection={'column'} h="100%" position={'relative'}>
      <TableContainer overflowY={'auto'}>
        <Table variant={'simple'} backgroundColor={'white'}>
          <Thead>
            <Tr>
              {columns.map((item) => (
                <Th
                  fontSize={'12px'}
                  py={4}
                  key={item.key}
                  border={'none'}
                  backgroundColor={'#F8F8FA'}
                  fontWeight={'500'}
                >
                  {t(item.title)}
                </Th>
              ))}
            </Tr>
          </Thead>
          <Tbody>
            {backups.map((app, i) => (
              <Tr key={app.id}>
                {columns.map((col) => (
                  <Td key={col.key}>
                    {col.render
                      ? col.render(app, i)
                      : col.dataIndex
                      ? `${app[col.dataIndex]}`
                      : '-'}
                  </Td>
                ))}
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>
      {isSuccess && backups.length === 0 && (
        <Flex justifyContent={'center'} alignItems={'center'} flexDirection={'column'} flex={1}>
          <MyIcon name={'noEvents'} color={'transparent'} width={'36px'} height={'36px'} />
          <Box pt={'8px'}>{t('No Data Available')}</Box>
        </Flex>
      )}
      <Loading loading={isInitialLoading} fixed={false} />
      <RestartConfirmDelChild />
      {isOpenBackupModal && data && (
        <BackupModal
          dbName={db.dbName}
          dbType={db.dbType}
          defaultVal={data}
          onClose={onCloseBackupModal}
          refetchPolicy={refetchPolicy}
        />
      )}
      {!!restoreBackupName && (
        <RestoreModal
          db={db}
          backupName={restoreBackupName}
          onClose={() => setRestoreBackupName(undefined)}
        />
      )}
    </Flex>
  );
};

export default React.memo(forwardRef(BackupTable));
